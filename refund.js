const { releaseEscrow } = require('./server/solana');

async function run() {
  const to = 'DNaLdh7FWc7HiPdrseaNdbYZ2fd3CQWf4jVg3ZTTRjPP';
  // Leave ~0.000995 for tx fee
  const amount = 0.149;
  console.log(`Sending ${amount} SOL to ${to}...`);
  const sig = await releaseEscrow(to, amount);
  console.log('Done! Tx:', sig);
}

run().catch(console.error);
