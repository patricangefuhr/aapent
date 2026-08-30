'use strict';
/**
 * No-DB verifisering av steg 2-logikken: klassifisering + dedup mot data/no_grocery.tsv.
 * Bruk: node scripts/classify-report.js
 */
const fs = require('fs');
const path = require('path');
const { classify } = require('../src/lib/classify');
const { parseTSV, COLS } = require('../src/lib/tsv');

const TSV = path.join(__dirname, '..', 'data', 'no_grocery.tsv');
const TYPE_RANK = { node: 0, way: 1, relation: 2 };

const { rows, skipped } = parseTSV(fs.readFileSync(TSV, 'utf8'), COLS);

const cat = {}; const included = [];
for (const r of rows) {
  const c = classify(r);
  cat[c.category] = (cat[c.category] || 0) + 1;
  if (c.include) { r._chain = c.chain; included.push(r); }
}

// dedup (samme logikk som import)
const best = new Map(); let dropped = 0;
const score = (r) => (r.opening_hours && r.opening_hours.trim() ? 1000 : 0) - (TYPE_RANK[r.type] ?? 3);
for (const r of included) {
  const key = `${(r._chain||r.brand||r.name||'').toLowerCase().trim()}|${Math.round(r.lat/0.0005)}|${Math.round(r.lon/0.0009)}`;
  const prev = best.get(key);
  if (!prev) best.set(key, r);
  else { dropped++; if (score(r) > score(prev)) best.set(key, r); }
}

console.log('════════ KLASSIFISERING + DEDUP (no-DB) ════════');
console.log(`  Rader:                 ${rows.length} (${skipped} malformede)`);
for (const k of Object.keys(cat).sort()) console.log(`  ${k.padEnd(24)} ${cat[k]}`);
console.log('──────────────────────────────────────────────');
console.log(`  Inkludert (dagligvare):${included.length}`);
console.log(`  Dedup slått sammen:    ${dropped}`);
console.log(`  Canonical butikker:    ${best.size}`);
console.log('════════════════════════════════════════════════');
