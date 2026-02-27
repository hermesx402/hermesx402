/**
 * HermesX402 Escrow — Mainnet: PDA-based escrow using deterministic keypairs
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

const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadAuthority() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(config.escrowWallet.secretKey));
}

function deriveEscrowKeypair(authority, taskId) {
  const hmac = crypto.createHmac('sha256', Buffer.from(authority.secretKey));
  hmac.update(`hermesx402-escrow-v1:${taskId}`);
  const seed = hmac.digest();
  return Keypair.fromSeed(seed);
}

function getEscrowAddress(authority, taskId) {
  return deriveEscrowKeypair(authority, taskId).publicKey;
}

async function createEscrow(taskId, amountSOL) {
  const conn = new Connection(MAINNET_RPC, 'confirmed');
  const authority = loadAuthority();
  const escrowKp = deriveEscrowKeypair(authority, taskId);

  const lamports = Math.round(amountSOL * LAMPORTS_PER_SOL);
  const existing = await conn.getBalance(escrowKp.publicKey);
  if (existing > 0) {
    return { address: escrowKp.publicKey.toBase58(), balance: existing };
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: escrowKp.publicKey,
      lamports,
    })
  );

  const sig = await sendAndConfirmTransaction(conn, tx, [authority]);
  return { address: escrowKp.publicKey.toBase58(), signature: sig };
}

async function checkStatus(taskId) {
  const conn = new Connection(MAINNET_RPC, 'confirmed');
  const authority = loadAuthority();
  const escrowPk = getEscrowAddress(authority, taskId);

  const balance = await conn.getBalance(escrowPk);
  return { address: escrowPk.toBase58(), balance };
}

async function releaseFunds(taskId, recipientPubkey, platformFeePercent = 0) {
  const conn = new Connection(MAINNET_RPC, 'confirmed');
  const authority = loadAuthority();
  const escrowKp = deriveEscrowKeypair(authority, taskId);
  const balance = await conn.getBalance(escrowKp.publicKey);

  if (balance === 0) return null;

  const fee = 5000; // tx fee
  const transferable = balance - fee;
  if (transferable <= 0) return null;

  const platformCut = Math.round(transferable * (platformFeePercent / 100));
  const agentPayout = transferable - platformCut;

  const tx = new Transaction();

  // Pay agent
  tx.add(SystemProgram.transfer({
    fromPubkey: escrowKp.publicKey,
    toPubkey: new PublicKey(recipientPubkey),
    lamports: agentPayout,
  }));

  // Platform fee back to authority
  if (platformCut > 0) {
    tx.add(SystemProgram.transfer({
      fromPubkey: escrowKp.publicKey,
      toPubkey: authority.publicKey,
      lamports: platformCut,
    }));
  }

  const sig = await sendAndConfirmTransaction(conn, tx, [escrowKp]);
  return { signature: sig, agentPayout, platformCut };
}

module.exports = { deriveEscrowKeypair, getEscrowAddress, createEscrow, checkStatus, releaseFunds, loadAuthority };
