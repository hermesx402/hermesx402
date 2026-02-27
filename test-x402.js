const http = require('http');

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const h = { 'Content-Type': 'application/json', ...headers };
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    const r = http.request({ hostname: 'localhost', port: 3402, path, method, headers: h }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        // Collect response headers we care about
        const x402Headers = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (k.startsWith('x-payment')) x402Headers[k] = v;
        }
        let parsed;
        try { parsed = JSON.parse(b); } catch(e) { parsed = b; }
        resolve({ status: res.statusCode, headers: x402Headers, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  const API_KEY = 'hx4-881ba6e4-dda5-4b11-82cc-13ec52c3d2cb';

  // Step 1: Check .well-known/x402 discovery
  console.log('=== STEP 1: x402 Protocol Discovery ===');
  const discovery = await req('GET', '/.well-known/x402');
  console.log('Status:', discovery.status);
  console.log(JSON.stringify(discovery.body, null, 2));

  // Step 2: Create a task — should get 402 back
  console.log('\n=== STEP 2: Create Task (expect 402) ===');
  const taskRes = await req('POST', '/api/tasks', {
    agent_id: 1,
    description: 'Research the x402 payment protocol and write a summary'
  });
  console.log('Status:', taskRes.status);
  console.log('x402 Headers:', JSON.stringify(taskRes.headers, null, 2));
  console.log('Body:', JSON.stringify(taskRes.body, null, 2));

  const taskId = taskRes.body.task_id || taskRes.body.id;
  if (!taskId) { console.log('No task ID found'); return; }

  // Step 3: Try to pay without proof — should get 402
  console.log('\n=== STEP 3: Pay without proof (expect 402) ===');
  const noProof = await req('POST', `/api/tasks/${taskId}/pay`);
  console.log('Status:', noProof.status);
  console.log('x402 Headers:', JSON.stringify(noProof.headers, null, 2));

  // Step 4: Try to pay with fake proof — should fail verification
  console.log('\n=== STEP 4: Pay with fake proof (expect error) ===');
  const fakeProof = await req('POST', `/api/tasks/${taskId}/pay`, null, {
    'X-Payment-Proof': 'fake_signature_123'
  });
  console.log('Status:', fakeProof.status);
  console.log('Body:', JSON.stringify(fakeProof.body, null, 2));

  // Step 5: Check task status
  console.log('\n=== STEP 5: Task status ===');
  const status = await req('GET', `/api/tasks/${taskId}`);
  console.log('Status:', status.status);
  console.log('Body:', JSON.stringify(status.body, null, 2));

  // Step 6: Check health
  console.log('\n=== STEP 6: Health ===');
  const health = await req('GET', '/api/health');
  console.log(JSON.stringify(health.body, null, 2));
}

run().catch(console.error);
