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
  console.log('=== Completing task 2 (releases escrow to agent wallet) ===');
  const res = await req('POST', '/api/tasks/2/complete', null, {
    'x-api-key': 'hx4-881ba6e4-dda5-4b11-82cc-13ec52c3d2cb'
  });
  console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
