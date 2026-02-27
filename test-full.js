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
        const xh = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (k.startsWith('x-payment')) xh[k] = v;
        }
        let parsed;
        try { parsed = JSON.parse(b); } catch(e) { parsed = b; }
        resolve({ status: res.statusCode, headers: xh, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  const escrow = 'GBtv9snKwP1j3TvL7vkDPM8enogNT2L9bcYWCBBdgAMh';
  const txSig = '2ea84dWG4ZD1GoLvdw22bBXz5RbNiTUGQuhMyqkioPRUvavkFkuzDGzqqK2JNrYVTohheL5oT4LufhmFAYB9YbLK';

  // 1. New API key
  console.log('=== 1. Generate API Key ===');
  const keyRes = await req('POST', '/api/keys', { owner_name: 'hermes' });
  const apiKey = keyRes.body.api_key;
  console.log('Key:', apiKey);

  // 2. Register hermes agent (wallet = escrow for testing, SOL goes back to same wallet)
  console.log('\n=== 2. Register hermes agent ===');
  const agentRes = await req('POST', '/api/agents', {
    name: 'hermes',
    description: 'General-purpose AI agent. Research, code, data, creative — whatever you need.',
    tags: ['research', 'code', 'data', 'creative'],
    price_sol: 0.05,
    wallet_address: escrow
  }, { 'x-api-key': apiKey });
  console.log('Agent ID:', agentRes.body.id, '- Name:', agentRes.body.name);

  const agentId = agentRes.body.id;

  // 3. Create task → 402
  console.log('\n=== 3. Create Task (402) ===');
  const taskRes = await req('POST', '/api/tasks', {
    agent_id: agentId,
    description: 'Full end-to-end x402 test'
  });
  console.log('Status:', taskRes.status);
  console.log('x402 Headers:', JSON.stringify(taskRes.headers, null, 2));
  const taskId = taskRes.body.task_id;
  console.log('Task ID:', taskId);

  // 4. Submit payment proof
  console.log('\n=== 4. Submit Payment Proof ===');
  const payRes = await req('POST', `/api/tasks/${taskId}/pay`, null, {
    'X-Payment-Proof': txSig
  });
  console.log('Status:', payRes.status);
  console.log('Task status:', payRes.body.status);
  console.log('Hirer wallet:', payRes.body.hirer_wallet);
  console.log('Payment verified:', payRes.body.payment_verified_at);

  // 5. Complete task → release escrow
  console.log('\n=== 5. Complete Task (release escrow) ===');
  const completeRes = await req('POST', `/api/tasks/${taskId}/complete`, null, {
    'x-api-key': apiKey
  });
  console.log('Status:', completeRes.status);
  console.log(JSON.stringify(completeRes.body, null, 2));
}

run().catch(console.error);
