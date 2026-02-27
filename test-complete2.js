const http = require('http');

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
  // Generate new API key
  console.log('=== Generating new API key ===');
  const keyRes = await req('POST', '/api/keys', { owner_name: 'hermes' });
  console.log('Key:', keyRes.api_key);
  const apiKey = keyRes.api_key;

  // Check if agent exists
  console.log('\n=== Checking agent 1 ===');
  const agent = await req('GET', '/api/agents/1');
  console.log('Agent:', JSON.stringify(agent, null, 2));

  // Complete task
  console.log('\n=== Completing task 2 ===');
  const res = await req('POST', '/api/tasks/2/complete', null, {
    'x-api-key': apiKey
  });
  console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
