/**
 * HermesX402 Escrow — Option C: PDA-based escrow using @solana/web3.js
 * 
 * No custom program needed. Uses deterministic keypairs derived from task IDs.
 * The escrow authority (server wallet) controls fund release.
 * 
 * How it works:
 * 1. For each task, derive a deterministic escrow address from taskId + authority pubkey
 * 2. Client sends SOL to the escrow address
 * 3. Only the authority can sign transactions to release funds from escrow
 * 4. Each task has a unique, verifiable on-chain address
 * 
 * Usage:
 *   node deploy-devnet.js setup       — Airdrop devnet SOL to authority
 *   node deploy-devnet.js create <taskId> <amountSOL>  — Create & fund escrow
 *   node deploy-devnet.js status <taskId>              — Check escrow balance
 *   node deploy-devnet.js release <taskId> <recipientPubkey> — Release funds
 *   node deploy-devnet.js test        — Full end-to-end test
 */

const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --- Config ---
const DEVNET_RPC = 'https://api.devnet.solana.com';
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadAuthority() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(config.escrowWallet.secretKey));
}

/**
 * Derive a deterministic escrow keypair from a task ID.
 * Uses HMAC-SHA256(authority_secret, taskId) as the seed for a Keypair.
 * This means:
 *   - Same taskId always produces the same escrow address
 *   - Only someone with the authority key can derive the escrow keypair
 *   - The escrow keypair can sign its own transactions (for release)
 */
function deriveEscrowKeypair(authority, taskId) {
  const hmac = crypto.createHmac('sha256', Buffer.from(authority.secretKey));
  hmac.update(`hermesx402-escrow-v1:${taskId}`);
  const seed = hmac.digest(); // 32 bytes
  return Keypair.fromSeed(seed);
}

/**
 * Get the escrow public key for a task (deterministic, no secret needed for lookup).
 * For public verification, we also store a mapping file.
 */
function getEscrowAddress(authority, taskId) {
  return deriveEscrowKeypair(authority, taskId).publicKey;
}

// --- Commands ---

async function setup() {
  const conn = new Connection(DEVNET_RPC, 'confirmed');
  const authority = loadAuthority();
  console.log(`Authority: ${authority.publicKey.toBase58()}`);
  
  const balance = await conn.getBalance(authority.publicKey);
  console.log(`Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('Requesting airdrop of 1 SOL...');
    try {
      const sig = await conn.requestAirdrop(authority.publicKey, 1 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, 'confirmed');
    } catch (e) {
      console.log('First airdrop attempt failed, retrying with 0.5 SOL...');
      await new Promise(r => setTimeout(r, 3000));
      const sig2 = await conn.requestAirdrop(authority.publicKey, 0.5 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig2, 'confirmed');
    }
    const newBalance = await conn.getBalance(authority.publicKey);
    console.log(`New balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
  }
  
  console.log(`\nExplorer: https://explorer.solana.com/address/${authority.publicKey.toBase58()}?cluster=devnet`);
}

async function createEscrow(taskId, amountSOL) {
  const conn = new Connection(DEVNET_RPC, 'confirmed');
  const authority = loadAuthority();
  const escrowKp = deriveEscrowKeypair(authority, taskId);
  
  console.log(`Task ID:        ${taskId}`);
  console.log(`Escrow address: ${escrowKp.publicKey.toBase58()}`);
  console.log(`Amount:         ${amountSOL} SOL`);
  
  const lamports = Math.round(amountSOL * LAMPORTS_PER_SOL);
  
  // Check if escrow already has funds
  const existing = await conn.getBalance(escrowKp.publicKey);
  if (existing > 0) {
    console.log(`\nEscrow already has ${existing / LAMPORTS_PER_SOL} SOL`);
    return { address: escrowKp.publicKey.toBase58(), balance: existing };
  }
  
  // Transfer SOL from authority to escrow address
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: escrowKp.publicKey,
      lamports,
    })
  );
  
  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  console.log(`\nFunded! TX: ${sig}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log(`Escrow:   https://explorer.solana.com/address/${escrowKp.publicKey.toBase58()}?cluster=devnet`);
  
  // Save mapping
  saveTaskMapping(taskId, escrowKp.publicKey.toBase58(), amountSOL, sig);
  
  return { address: escrowKp.publicKey.toBase58(), signature: sig };
}

async function checkStatus(taskId) {
  const conn = new Connection(DEVNET_RPC, 'confirmed');
  const authority = loadAuthority();
  const escrowPk = getEscrowAddress(authority, taskId);
  
  const balance = await conn.getBalance(escrowPk);
  console.log(`Task ID:        ${taskId}`);
  console.log(`Escrow address: ${escrowPk.toBase58()}`);
  console.log(`Balance:        ${balance / LAMPORTS_PER_SOL} SOL`);
  console.log(`Explorer:       https://explorer.solana.com/address/${escrowPk.toBase58()}?cluster=devnet`);
  
  return { address: escrowPk.toBase58(), balance };
}

async function releaseFunds(taskId, recipientPubkey) {
  const conn = new Connection(DEVNET_RPC, 'confirmed');
  const authority = loadAuthority();
  const escrowKp = deriveEscrowKeypair(authority, taskId);
  const recipient = new PublicKey(recipientPubkey);
  
  const balance = await conn.getBalance(escrowKp.publicKey);
  if (balance === 0) {
    console.log('Escrow is empty — nothing to release.');
    return null;
  }
  
  // We need to leave enough for rent/fees. Transfer all minus a small fee buffer.
  const fee = 5000; // 0.000005 SOL for tx fee
  const transferAmount = balance - fee;
  
  if (transferAmount <= 0) {
    console.log('Balance too low to cover tx fee.');
    return null;
  }
  
  console.log(`Releasing ${transferAmount / LAMPORTS_PER_SOL} SOL to ${recipientPubkey}`);
  
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: escrowKp.publicKey,
      toPubkey: recipient,
      lamports: transferAmount,
    })
  );
  
  // The escrow keypair signs (we can derive it because we have the authority secret)
  const sig = await sendAndConfirmTransaction(conn, tx, [escrowKp]);
  console.log(`\nReleased! TX: ${sig}`);
  console.log(`Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  
  return { signature: sig, amount: transferAmount };
}

function saveTaskMapping(taskId, address, amountSOL, sig) {
  const mapFile = path.join(__dirname, 'task-escrows.json');
  let map = {};
  try { map = JSON.parse(fs.readFileSync(mapFile, 'utf8')); } catch {}
  map[taskId] = { address, amountSOL, fundTx: sig, createdAt: new Date().toISOString() };
  fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
}

// --- End-to-end test ---
async function runTest() {
  console.log('=== HermesX402 Escrow E2E Test (Devnet) ===\n');
  
  // 1. Setup
  console.log('--- Step 1: Setup authority ---');
  await setup();
  
  // 2. Create test escrow
  const testTaskId = `test-task-${Date.now()}`;
  console.log(`\n--- Step 2: Create escrow for "${testTaskId}" ---`);
  const result = await createEscrow(testTaskId, 0.01);
  
  // 3. Check status
  console.log('\n--- Step 3: Check escrow status ---');
  await checkStatus(testTaskId);
  
  // 4. Release to a test recipient (back to authority for testing)
  const authority = loadAuthority();
  console.log('\n--- Step 4: Release funds back to authority ---');
  const release = await releaseFunds(testTaskId, authority.publicKey.toBase58());
  
  // 5. Verify empty
  console.log('\n--- Step 5: Verify escrow is empty ---');
  await checkStatus(testTaskId);
  
  console.log('\n=== Test Complete ===');
  return { testTaskId, escrowAddress: result.address, fundTx: result.signature, releaseTx: release?.signature };
}

// --- CLI ---
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  
  try {
    switch (cmd) {
      case 'setup':
        await setup();
        break;
      case 'create':
        if (args.length < 2) { console.log('Usage: create <taskId> <amountSOL>'); return; }
        await createEscrow(args[0], parseFloat(args[1]));
        break;
      case 'status':
        if (args.length < 1) { console.log('Usage: status <taskId>'); return; }
        await checkStatus(args[0]);
        break;
      case 'release':
        if (args.length < 2) { console.log('Usage: release <taskId> <recipientPubkey>'); return; }
        await releaseFunds(args[0], args[1]);
        break;
      case 'test':
        await runTest();
        break;
      default:
        console.log('Commands: setup | create <taskId> <amount> | status <taskId> | release <taskId> <recipient> | test');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();

// Export for programmatic use
module.exports = { deriveEscrowKeypair, getEscrowAddress, createEscrow, checkStatus, releaseFunds, loadAuthority };
