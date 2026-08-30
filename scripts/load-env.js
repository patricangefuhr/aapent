'use strict';
// Minimal .env-laster (ingen ekstern avhengighet). Leser KEY=VALUE fra prosjektrot/.env.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', '.env');
try {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq === -1) continue;
    const k = s.slice(0, eq).trim();
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
} catch { /* ingen .env — bruk eksisterende env */ }
