const path = require('path');
const config = require(path.join(__dirname, '..', 'config.json'));

/**
 * x402 protocol middleware and helpers
 */

// Middleware: add protocol header to all responses
function x402Protocol(req, res, next) {
  res.set('X-Payment-Protocol', 'x402/1.0');
  next();
}

// Generate a 402 Payment Required response for a task
function send402(res, { taskId, amount, address, message }) {
  const headers = {
    'X-Payment-Required': 'true',
    'X-Payment-Amount': String(amount),
    'X-Payment-Address': address,
    'X-Payment-Network': 'solana-mainnet',
    'X-Payment-Currency': 'SOL',
    'X-Payment-Task-Id': String(taskId),
  };

  Object.entries(headers).forEach(([k, v]) => res.set(k, v));

  return res.status(402).json({
    error: 'Payment Required',
    protocol: 'x402/1.0',
    task_id: taskId,
    payment: {
      amount,
      currency: 'SOL',
      network: 'solana-mainnet',
      address,
    },
    message: message || `Send ${amount} SOL to ${address} then POST /api/tasks/${taskId}/pay with X-Payment-Proof header`,
  });
}

// Extract payment proof from request headers
function getPaymentProof(req) {
  return req.headers['x-payment-proof'] || null;
}

// Discovery endpoint data
function discoveryInfo() {
  return {
    protocol: 'x402/1.0',
    version: '1.0',
    description: 'hermesx402 — AI agent marketplace with x402 HTTP payment protocol',
    supported_currencies: ['SOL'],
    networks: ['solana-mainnet'],
    payment_address: config.escrowWallet.publicKey,
    endpoints: {
      create_task: 'POST /api/tasks',
      pay_task: 'POST /api/tasks/:id/pay',
      complete_task: 'POST /api/tasks/:id/complete',
      discovery: 'GET /.well-known/x402',
    },
    flow: [
      '1. POST /api/tasks with { agent_id, description } → receive 402 with payment details',
      '2. Send SOL to the payment address',
      '3. POST /api/tasks/:id/pay with X-Payment-Proof: <tx_signature> → 200 if verified',
      '4. Agent completes work → POST /api/tasks/:id/complete',
    ],
  };
}

module.exports = { x402Protocol, send402, getPaymentProof, discoveryInfo };
