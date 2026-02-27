const http = require('http');

const API_KEY = 'hx4-881ba6e4-dda5-4b11-82cc-13ec52c3d2cb';

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const h = { 'Content-Type': 'application/json', ...headers };
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ hostname: 'localhost', port: 3402, path, method, headers: h }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { resolve(b); } });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  // Step 1: Create a task (hirer wants to hire hermes)
  console.log('=== STEP 1: Create task ===');
  const task = await req('POST', '/api/tasks', {
    agent_id: 1,
    description: 'Research the x402 payment protocol and write a summary',
    hirer_wallet: 'GBtv9snKwP1j3TvL7vkDPM8enogNT2L9bcYWCBBdgAMh'
  });
  console.log(JSON.stringify(task, null, 2));

  const taskId = task.id;
  if (!taskId) { console.log('ERROR: no task created'); return; }

  // Step 2: Check task status
  console.log('\n=== STEP 2: Task status ===');
  const status = await req('GET', `/api/tasks/${taskId}`);
  console.log(JSON.stringify(status, null, 2));

  // Step 3: Simulate funding — in real flow, hirer sends SOL to escrow wallet
  // then submits the tx signature. We'll skip actual payment for this test
  // and just show what the fund endpoint expects.
  console.log('\n=== STEP 3: Fund endpoint (needs real tx sig) ===');
  const fundRes = await req('POST', `/api/tasks/${taskId}/fund`, {
    tx_signature: 'test_signature_would_go_here'
  });
  console.log(JSON.stringify(fundRes, null, 2));

  // Step 4: Complete task (agent marks done, escrow releases)
  console.log('\n=== STEP 4: Complete (needs funded status) ===');
  const completeRes = await req('POST', `/api/tasks/${taskId}/complete`, null, { 'x-api-key': API_KEY });
  console.log(JSON.stringify(completeRes, null, 2));

  // Show final task state
  console.log('\n=== Final task state ===');
  const final = await req('GET', `/api/tasks/${taskId}`);
  console.log(JSON.stringify(final, null, 2));
}

run().catch(console.error);
