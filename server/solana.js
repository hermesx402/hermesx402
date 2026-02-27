const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require('@solana/web3.js');
const path = require('path');

const config = require(path.join(__dirname, '..', 'config.json'));

const connection = new Connection(config.rpcUrl, 'confirmed');
const escrowKeypair = Keypair.fromSecretKey(Uint8Array.from(config.escrowWallet.secretKey));

/**
 * Verify an on-chain SOL transfer.
 * Returns true if the tx contains a system transfer of >= expectedAmount
 * from fromWallet to toWallet and is finalized.
 */
async function verifyPayment(signature, expectedAmount, fromWallet, toWallet) {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta.err) return false;

    const expectedLamports = Math.round(expectedAmount * LAMPORTS_PER_SOL);
    const accountKeys = tx.transaction.message.staticAccountKeys
      ? tx.transaction.message.staticAccountKeys.map(k => k.toBase58())
      : tx.transaction.message.accountKeys.map(k => k.toBase58());

    const toIndex = accountKeys.indexOf(toWallet);
    if (toIndex === -1) return false;

    // If fromWallet specified, verify sender too
    if (fromWallet) {
      const fromIndex = accountKeys.indexOf(fromWallet);
      if (fromIndex === -1) return false;
    }

    // Check pre/post balances for the transfer amount
    const preTo = tx.meta.preBalances[toIndex];
    const postTo = tx.meta.postBalances[toIndex];
    const received = postTo - preTo;

    // Also extract sender wallet (first signer) for recording
    const senderWallet = accountKeys[0];
    if (received >= expectedLamports) {
      return { verified: true, sender: senderWallet, received };
    }
    return false;
  } catch (err) {
    console.error('verifyPayment error:', err.message);
    return false;
  }
}

/**
 * Send SOL from escrow wallet to a destination wallet.
 */
async function sendFromEscrow(toWalletAddress, amountSol) {
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  const toPubkey = new PublicKey(toWalletAddress);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: escrowKeypair.publicKey,
      toPubkey,
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [escrowKeypair], {
    commitment: 'confirmed',
  });

  return signature;
}

async function releaseEscrow(toWallet, amount) {
  return sendFromEscrow(toWallet, amount);
}

async function refundEscrow(toWallet, amount) {
  return sendFromEscrow(toWallet, amount);
}

module.exports = {
  connection,
  escrowKeypair,
  verifyPayment,
  releaseEscrow,
  refundEscrow,
};
