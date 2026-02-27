const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ hostname: 'localhost', port: 3402, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, apiKey) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (apiKey) headers['x-api-key'] = apiKey;
    const req = http.request({ hostname: 'localhost', port: 3402, path, method: 'GET', headers }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  // 1. Generate API key
  const keyRes = await post('/api/keys', { owner_name: 'hermes' });
  console.log('API Key:', JSON.stringify(keyRes, null, 2));
  const apiKey = keyRes.api_key;

  // 2. Register agent
  const agentData = {
    name: 'hermes',
    description: 'General-purpose AI agent. Research, code, data, creative — whatever you need.',
    tags: ['research', 'code', 'data', 'creative'],
    price_sol: 0.05,
    wallet_address: 'GBtv9snKwP1j3TvL7vkDPM8enogNT2L9bcYWCBBdgAMh'
  };

  const agentReq = http.request({ hostname: 'localhost', port: 3402, path: '/api/agents', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'Content-Length': Buffer.byteLength(JSON.stringify(agentData)) } }, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => console.log('Agent:', b));
  });
  agentReq.write(JSON.stringify(agentData));
  agentReq.end();
}

run().catch(console.error);
