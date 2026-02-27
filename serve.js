const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
    let fp = path.join(dir, req.url === '/' ? 'index.html' : req.url);
    let ext = path.extname(fp);
    fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': mime[ext] || 'text/html' });
        res.end(data);
    });
}).listen(8402, '0.0.0.0', () => console.log('Server running on http://localhost:8402'));
