'use strict';
require('./load-env');
/**
 * Eksporter et ekte nearby-uttrekk til public/data/snapshot.json for frontend-utvikling/-test
 * (før live anon-key er på plass). Rå opening_hours følger med; klienten beregner status selv.
 * Bruk: node scripts/export-snapshot.js [lat] [lon] [radius_m]
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const LAT = parseFloat(process.argv[2] || '59.9139'); // Oslo sentrum
const LON = parseFloat(process.argv[3] || '10.7522');
const R = parseInt(process.argv[4] || '20000', 10);

async function main() {
  const url = process.env.DATABASE_URL;
  const client = new Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query('select * from nearby_stores($1,$2,$3)', [LAT, LON, R]);
  await client.end();
  const out = { center: { lat: LAT, lon: LON }, radius_m: R, generated_at: new Date().toISOString(), count: rows.length, stores: rows };
  const dir = path.join(__dirname, '..', 'public', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(out));
  console.log(`Snapshot: ${rows.length} butikker rundt ${LAT},${LON} (${R/1000} km) -> public/data/snapshot.json`);
}
main().catch(e => { console.error(e); process.exit(1); });
