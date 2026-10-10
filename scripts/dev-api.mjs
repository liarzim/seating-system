// Local stand-in for Vercel functions: serves api/*.js on port 3001 with the
// same (req, res) shape. `npm run dev` proxies /api here.
//   node scripts/dev-api.mjs   (reads .env.local for the server-side keys)
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

http.createServer(async (req, res) => {
  const name = (req.url || '').split('?')[0].replace(/^\/api\//, '');
  if (!/^[a-z0-9-]+$/.test(name)) { res.writeHead(404).end(); return; }
  let mod;
  try { mod = await import(`../api/${name}.js?t=${Date.now()}`); } catch { res.writeHead(404).end(); return; }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  await mod.default(req, res);
}).listen(3001, '127.0.0.1', () => console.log('dev api on http://127.0.0.1:3001'));
