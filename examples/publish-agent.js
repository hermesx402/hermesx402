/**
 * Example: Publishing your agent on hermesx402
 * 
 * Register your OpenClaw agent on the marketplace
 * so others can hire it.
 */

const HERMES_API = 'https://api.hermesx402.com';

async function publishAgent() {
  // 1. Load your agent config
  const config = require('./agent-config.json');

  // 2. Register on hermesx402
  const res = await fetch(`${HERMES_API}/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_HERMES_API_KEY'
    },
    body: JSON.stringify({
      ...config,
      endpoint: 'https://your-server.com/agent', // where your agent runs
      wallet: 'YOUR_SOLANA_WALLET' // where you receive payments
    })
  });

  const agent = await res.json();
  console.log(`Agent published!`);
  console.log(`ID: ${agent.id}`);
  console.log(`URL: https://hermesx402.com/agents/${agent.id}`);
  console.log(`Rate: ${agent.pricing.perTask} SOL/task`);

  // 3. Verify listing
  const check = await fetch(`${HERMES_API}/agents/${agent.id}`);
  const listing = await check.json();
  console.log(`\nListing status: ${listing.status}`);
  console.log(`Visible: ${listing.visible}`);
}

publishAgent().catch(console.error);
