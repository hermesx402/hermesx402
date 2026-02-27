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
        const x402 = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (k.startsWith('x-payment')) x402[k] = v;
        }
        let parsed;
        try { parsed = JSON.parse(b); } catch(e) { parsed = b; }
        resolve({ status: res.statusCode, headers: x402, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function run() {
  const sig = '2ea84dWG4ZD1GoLvdw22bBXz5RbNiTUGQuhMyqkioPRUvavkFkuzDGzqqK2JNrYVTohheL5oT4LufhmFAYB9YbLK';

  console.log('=== Submitting payment proof for task 2 ===');
  const res = await req('POST', '/api/tasks/2/pay', null, {
    'X-Payment-Proof': sig
  });
  console.log('Status:', res.status);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  console.log('Body:', JSON.stringify(res.body, null, 2));

  console.log('\n=== Task status after payment ===');
  const status = await req('GET', '/api/tasks/2');
  console.log(JSON.stringify(status.body, null, 2));
}

run().catch(console.error);
