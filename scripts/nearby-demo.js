'use strict';
process.env.TZ = 'Europe/Oslo';
require('./load-env');
/**
 * Steg 4-test: kall nearby_stores(lat,lon,radius) via PostGIS og fest åpningsstatus (opening_hours.js).
 * Tester 5/10/20 km rundt en ekte norsk lokasjon.
 *
 * Krever env: DATABASE_URL. Bruk: DATABASE_URL=... node scripts/nearby-demo.js [lat] [lon]
 */
const { Client } = require('pg');
const oh = require('../src/lib/opening-hours');

// Default: Heggedal (jf. eksempelet "KIWI Heggedal"). Overstyr via argv.
const LAT = parseFloat(process.argv[2] || '59.8010');
const LON = parseFloat(process.argv[3] || '10.4460');
const NOW = new Date();

const DOT = { OPEN: '🟢', CLOSED: '🔴', UNKNOWN: '⚪', INVALID: '⚪' };

function statusLine(row) {
  const r = oh.evaluate(row.opening_hours, NOW);
  let txt;
  if (r.state === 'OPEN') txt = r.is_24_7 ? 'Åpent nå · døgnåpent' : `Åpent nå · stenger ${oh.fmtTime(r.closes_at)}`;
  else if (r.state === 'CLOSED') txt = r.next_opens_at ? `Stengt · åpner ${oh.fmtWeekdayTime(r.next_opens_at)}` : 'Stengt';
  else txt = 'Åpningstid ukjent';
  return `${DOT[r.state]} ${txt}`;
}
const fmtDist = (m) => m < 1000 ? `${m} m` : `${(m/1000).toFixed(1).replace('.', ',')} km`;

async function radius(client, r) {
  const { rows } = await client.query('select * from nearby_stores($1,$2,$3)', [LAT, LON, r]);
  console.log(`\n── ${r/1000} km: ${rows.length} butikker ──`);
  for (const row of rows.slice(0, 8)) {
    console.log(`  ${(row.name||row.brand||'(uten navn)')}`);
    console.log(`    ${statusLine(row)}   ·   ${fmtDist(row.distance_m)}`);
  }
  if (rows.length > 8) console.log(`  … +${rows.length - 8} til`);
  return rows.length;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('FEIL: mangler DATABASE_URL'); process.exit(1); }
  const client = new Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Posisjon: ${LAT}, ${LON}   ·   ${oh.fmtWeekdayTime(NOW)}`);
  const c5 = await radius(client, 5000);
  const c10 = await radius(client, 10000);
  const c20 = await radius(client, 20000);
  console.log(`\nOppsummering: 5km=${c5}  10km=${c10}  20km=${c20}  (skal øke monotont)`);
  console.log(c5 <= c10 && c10 <= c20 ? 'GATE OK: radius-monotoni ✔' : 'ADVARSEL: ikke-monoton radius');
  await client.end();
}
main().catch(e => { console.error(e); process.exit(1); });
