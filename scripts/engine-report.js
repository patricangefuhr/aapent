'use strict';
process.env.TZ = 'Europe/Oslo';
/**
 * Kjør åpningstidsmotoren mot hele Norge-datasettet (data/no_grocery.tsv) og rapporter.
 * Read-only. Bruk: node scripts/engine-report.js [ISO-tidspunkt for "valgt søndag"]
 */
const fs = require('fs');
const path = require('path');
const oh = require('../src/lib/opening-hours');
const { classify } = require('../src/lib/classify');
const { parseTSV, COLS } = require('../src/lib/tsv');

const TSV = path.join(__dirname, '..', 'data', 'no_grocery.tsv');
// Valgt søndag: default 2026-08-30 13:00 (en faktisk søndag).
const SUNDAY = new Date(process.argv[2] || '2026-08-30T13:00:00+02:00');

function pct(n, d) { return d === 0 ? '0.0' : (100 * n / d).toFixed(1); }

const { rows, skipped } = parseTSV(fs.readFileSync(TSV, 'utf8'), COLS);

// Klassifiser -> behold ekte dagligvare
const included = [];
const excluded = { excluded_fuel_kiosk: 0, excluded_other: 0 };
for (const r of rows) {
  const c = classify(r);
  if (c.include) { r._chain = c.chain; r._cat = c.category; included.push(r); }
  else { excluded[c.category] = (excluded[c.category] || 0) + 1; }
}

// Evaluer motoren over inkluderte butikker
let withOH = 0, valid = 0, invalid = 0, missing = 0, openSunday = 0, is247 = 0;
const byChain = new Map();
function chainRow(name) {
  if (!byChain.has(name)) byChain.set(name, { total:0, withOH:0, valid:0, invalid:0, openSun:0 });
  return byChain.get(name);
}
for (const r of included) {
  const chainName = r._chain || '(uavhengig)';
  const cr = chainRow(chainName);
  cr.total++;
  const ohStr = r.opening_hours;
  const hasOH = ohStr != null && ohStr.trim() !== '';
  if (hasOH) { withOH++; cr.withOH++; } else { missing++; }
  if (hasOH) {
    const v = oh.validate(ohStr);
    if (v.valid) { valid++; cr.valid++; } else { invalid++; cr.invalid++; }
  }
  const res = oh.evaluate(ohStr, SUNDAY);
  if (res.state === 'OPEN') { openSunday++; cr.openSun++; }
  if (res.is_24_7) is247++;
}

const successRate = pct(valid, withOH); // andel av de MED oh som er parsebare

console.log('══════════════════════════════════════════════════════════════');
console.log('  ÅPNINGSTIDSMOTOR — RAPPORT MOT HELE NORGE-DATASETTET');
console.log('══════════════════════════════════════════════════════════════');
console.log(`  Datasett:            ${rows.length} rader (${skipped} malformede hoppet over)`);
console.log(`  Ekskludert:          kiosk/bensin ${excluded.excluded_fuel_kiosk||0}, annet ${excluded.excluded_other||0}`);
console.log(`  Inkludert (dagligvare): ${included.length}`);
console.log('──────────────────────────────────────────────────────────────');
console.log(`  Med opening_hours:   ${withOH}  (${pct(withOH, included.length)}%)`);
console.log(`  Uten (=> UNKNOWN):   ${missing}  (${pct(missing, included.length)}%)`);
console.log(`  Valid (parsebar):    ${valid}`);
console.log(`  Invalid:             ${invalid}`);
console.log(`  Success rate:        ${successRate}%  (valid / med opening_hours)`);
console.log(`  Merket 24/7:         ${is247}`);
console.log('──────────────────────────────────────────────────────────────');
console.log(`  VALGT SØNDAG:        ${SUNDAY.toISOString()}  (${oh.fmtWeekdayTime(SUNDAY)})`);
console.log(`  FAKTISK ÅPNE NÅ:     ${openSunday}  (${pct(openSunday, included.length)}% av dagligvare)`);
console.log('══════════════════════════════════════════════════════════════');
console.log('  PER STOR KJEDE (total / m-OH / valid / åpne den søndagen)');
console.log('──────────────────────────────────────────────────────────────');
const sorted = [...byChain.entries()].sort((a,b) => b[1].total - a[1].total);
console.log('  ' + 'KJEDE'.padEnd(16) + 'TOT'.padStart(6) + 'm-OH'.padStart(7) + 'VALID'.padStart(7) + 'ÅPNE-SØN'.padStart(10));
for (const [name, s] of sorted) {
  if (s.total < 20 && name !== '(uavhengig)') continue;
  console.log('  ' + name.padEnd(16) + String(s.total).padStart(6) + String(s.withOH).padStart(7) +
              String(s.valid).padStart(7) + String(s.openSun).padStart(10));
}
console.log('══════════════════════════════════════════════════════════════');
