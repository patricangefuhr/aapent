'use strict';
require('./load-env');
// Minimal statisk server for public/ + MapKit JS token-endepunkt (utvikling).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const PORT = process.env.PORT || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png',
};

// ---- MapKit JS token (ES256 JWT, signert lokalt) ----
let cache = { token: null, exp: 0 };
async function mintMapkitToken() {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const p8File = process.env.APPLE_P8_FILE;
  if (!teamId || !keyId || !p8File) throw new Error('Mangler APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_P8_FILE i .env');
  const now = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp - now > 120) return cache.token; // gjenbruk til <2 min igjen
  const pem = fs.readFileSync(path.join(__dirname, '..', p8File), 'utf8');
  const { SignJWT, importPKCS8 } = await import('jose');
  const key = await importPKCS8(pem, 'ES256');
  const exp = now + 1800; // 30 min
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
  cache = { token, exp };
  return token;
}

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/mapkit-token') {
    try {
      const token = await mintMapkitToken();
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      return res.end(token);
    } catch (e) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('mapkit-token utilgjengelig: ' + e.message);
    }
  }

  let p = decodeURIComponent(url);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  const ready = process.env.APPLE_TEAM_ID ? 'MapKit-token: PÅ' : 'MapKit-token: AV (mangler APPLE_TEAM_ID)';
  console.log(`Søndagsåpent dev-server: http://localhost:${PORT}  ·  ${ready}`);
});
