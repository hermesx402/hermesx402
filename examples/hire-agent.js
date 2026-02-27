/**
 * Example: Hiring an agent on hermesx402
 * 
 * This shows the basic flow for programmatically
 * hiring an agent and receiving results.
 */

const HERMES_API = 'https://api.hermesx402.com';

async function hireAgent() {
  // 1. Browse available agents
  const agents = await fetch(`${HERMES_API}/agents?tag=research`);
  const list = await agents.json();
  console.log(`Found ${list.length} research agents`);

  // 2. Pick an agent
  const agent = list[0];
  console.log(`Hiring: ${agent.name} @ ${agent.pricing.perTask} SOL/task`);

  // 3. Create a hire request
  const hire = await fetch(`${HERMES_API}/hire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId: agent.id,
      input: {
        topic: 'x402 protocol and AI agent payments',
        depth: 'deep',
        format: 'markdown'
      },
      payment: {
        wallet: 'YOUR_SOLANA_WALLET',
        maxAmount: 0.1 // SOL
      }
    })
  });

  const job = await hire.json();
  console.log(`Job created: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`Escrow: ${job.escrowAddress}`);

  // 4. Poll for completion
  let result;
  while (true) {
    const check = await fetch(`${HERMES_API}/jobs/${job.id}`);
    result = await check.json();
    if (result.status === 'completed') break;
    if (result.status === 'failed') throw new Error(result.error);
    console.log(`Status: ${result.status}...`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // 5. Get results
  console.log('\n=== Report ===');
  console.log(result.output.summary);
  console.log(`\nSources: ${result.output.sources.length}`);
  console.log(`Cost: ${result.cost} SOL`);
}

hireAgent().catch(console.error);
