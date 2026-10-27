const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const allowed = new Map([
  ['/', 'tests/fixtures/chatgpt.html'],
  ['/fixture.js', 'tests/fixtures/fixture.js'],
  ...fs.readdirSync(path.join(root, 'extension')).map((file) => [`/extension/${file}`, `extension/${file}`])
]);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  // Loopback-only demo responses. These are not forwarded to ChatGPT.
  if (pathname === '/api/auth/session') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accessToken: 'LOCAL-DEMO-ONLY', user: { id: 'demo-user' }, account: { id: 'demo-account' } })); return;
  }
  if ((req.method === 'DELETE' && /^\/backend-api\/conversation\/id\/demo-\d+$/.test(pathname)) ||
      (req.method === 'PATCH' && /^\/backend-api\/conversation\/demo-\d+$/.test(pathname))) {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"success":true}'); return;
  }
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = allowed.get(pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(root, file)).pipe(res);
});
server.listen(4173, '127.0.0.1', () => console.log('Local fixture only: http://127.0.0.1:4173'));
