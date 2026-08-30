'use strict';
process.env.TZ = 'Europe/Oslo';
require('./load-env');
/**
 * Importer norske dagligvarebutikker fra data/no_grocery.tsv til Supabase (places).
 *
 * - Idempotent: ON CONFLICT (osm_type, osm_id) DO UPDATE. Re-kjøring lager ingen duplikater.
 * - Klassifisering: kun ekte dagligvare (src/lib/classify). kiosk/bensin ekskluderes.
 * - Dedup: fysiske duplikater (samme kjede/brand innen ~55m) slås sammen til én canonical.
 * - Manglende opening_hours beholdes (=> UNKNOWN i UI), aldri tolket som stengt.
 * - Soft-delete: OSM-butikker som ikke lenger finnes i uttrekket settes is_active=false.
 * - Batch-upsert (chunk) for få round-trips.
 *
 * Krever env: DATABASE_URL. Bruk: node scripts/import-norway.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { classify } = require('../src/lib/classify');
const ohEngine = require('../src/lib/opening-hours');
const { parseTSV, COLS } = require('../src/lib/tsv');

const TSV = path.join(__dirname, '..', 'data', 'no_grocery.tsv');
const SOURCE = 'osm';
const TYPE_RANK = { node: 0, way: 1, relation: 2 };
const CHUNK = 500;

function dedup(cands) {
  const best = new Map(); let dropped = 0;
  const score = (r) => (r.opening_hours && r.opening_hours.trim() ? 1000 : 0) - (TYPE_RANK[r.type] ?? 3);
  for (const r of cands) {
    const glat = Math.round(parseFloat(r.lat) / 0.0005);
    const glon = Math.round(parseFloat(r.lon) / 0.0009);
    const idkey = (r._chain || r.brand || r.name || '').toLowerCase().trim();
    const key = `${idkey}|${glat}|${glon}`;
    const prev = best.get(key);
    if (!prev) best.set(key, r);
    else { dropped++; if (score(r) > score(prev)) best.set(key, r); }
  }
  return { kept: [...best.values()], dropped };
}

const INSERT_COLS = ['osm_type','osm_id','name','brand','operator','chain','shop_type','category',
  'latitude','longitude','geog','opening_hours','opening_hours_valid','phone','website',
  'confidence','is_active','source','source_updated_at'];

function buildBatch(chunk, importedAt) {
  const params = [];
  const tuples = [];
  for (const r of chunk) {
    const ohStr = r.opening_hours && r.opening_hours.trim() ? r.opening_hours.trim() : null;
    const ohValid = ohStr == null ? null : ohEngine.validate(ohStr).valid;
    const vals = [r.type, parseInt(r.id,10), r.name||null, r.brand||null, r.operator||null,
      r._chain||null, r.shop, r._category, parseFloat(r.lat), parseFloat(r.lon),
      ohStr, ohValid, r.phone||null, r.website||null, r._confidence, true, SOURCE, importedAt];
    const b = params.length;
    // geog bygges fra lon/lat-parametrene ($b+10 = lon? nei: latitude=b+9, longitude=b+10)
    const p = (n) => `$${b + n}`;
    tuples.push(`(${p(1)},${p(2)},${p(3)},${p(4)},${p(5)},${p(6)},${p(7)},${p(8)},${p(9)},${p(10)},`
      + `ST_SetSRID(ST_MakePoint(${p(10)},${p(9)}),4326)::geography,`
      + `${p(11)},${p(12)},${p(13)},${p(14)},${p(15)},${p(16)},${p(17)},${p(18)})`);
    params.push(...vals);
  }
  const sql =
    `insert into places (${INSERT_COLS.join(',')}) values ${tuples.join(',')}
     on conflict (osm_type, osm_id) do update set
       name=excluded.name, brand=excluded.brand, operator=excluded.operator,
       chain=excluded.chain, shop_type=excluded.shop_type, category=excluded.category,
       latitude=excluded.latitude, longitude=excluded.longitude, geog=excluded.geog,
       opening_hours=excluded.opening_hours, opening_hours_valid=excluded.opening_hours_valid,
       phone=excluded.phone, website=excluded.website, confidence=excluded.confidence,
       is_active=true, source=excluded.source, source_updated_at=excluded.source_updated_at
     returning (xmax = 0) as inserted`;
  return { sql, params };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('FEIL: mangler DATABASE_URL.'); process.exit(1); }

  const { rows, skipped } = parseTSV(fs.readFileSync(TSV, 'utf8'), COLS);
  const included = []; let exFuel = 0, exOther = 0;
  for (const r of rows) {
    const c = classify(r);
    if (!c.include) { c.category === 'excluded_fuel_kiosk' ? exFuel++ : exOther++; continue; }
    r._chain = c.chain; r._category = c.category; r._confidence = c.confidence;
    included.push(r);
  }
  const { kept, dropped } = dedup(included);
  const importedAt = new Date().toISOString();

  const client = new Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  await client.connect();
  const run = await client.query(
    `insert into import_runs(source, area, n_found) values($1,'NO',$2) returning id`, [SOURCE, kept.length]);
  const runId = run.rows[0].id;

  let inserted = 0, updated = 0, deactivated = 0;
  const seenKeys = kept.map(r => `${r.type}/${r.id}`);
  try {
    await client.query('begin');
    for (let i = 0; i < kept.length; i += CHUNK) {
      const { sql, params } = buildBatch(kept.slice(i, i + CHUNK), importedAt);
      const res = await client.query(sql, params);
      for (const row of res.rows) row.inserted ? inserted++ : updated++;
      process.stdout.write(`\r  upsert ${Math.min(i + CHUNK, kept.length)}/${kept.length}`);
    }
    process.stdout.write('\n');
    const del = await client.query(
      `update places set is_active=false
        where source=$1 and is_active=true and (osm_type||'/'||osm_id) <> all($2::text[])`,
      [SOURCE, seenKeys]);
    deactivated = del.rowCount;
    await client.query(
      `update import_runs set finished_at=now(), n_inserted=$1, n_updated=$2, n_deactivated=$3,
              n_dedup_dropped=$4, notes=$5 where id=$6`,
      [inserted, updated, deactivated, dropped,
       `skipped_malformed=${skipped}; excluded_fuel=${exFuel}; excluded_other=${exOther}`, runId]);
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    console.error('\nIMPORT FEILET, rullet tilbake:', e.message);
    await client.end(); process.exit(1);
  }

  const stats = (await client.query(
    `select count(*)::int total, count(*) filter (where is_active)::int active,
            count(*) filter (where opening_hours is not null)::int with_oh,
            count(*) filter (where opening_hours_valid)::int oh_valid
     from places`)).rows[0];
  await client.end();

  console.log('════════ IMPORT FULLFØRT (run #' + runId + ') ════════');
  console.log(`  Uttrekk:             ${rows.length} rader (${skipped} malformede)`);
  console.log(`  Ekskludert:          kiosk/bensin ${exFuel}, annet ${exOther}`);
  console.log(`  Dedup slått sammen:  ${dropped}`);
  console.log(`  Inserted / Updated:  ${inserted} / ${updated}`);
  console.log(`  Deaktivert (borte):  ${deactivated}`);
  console.log(`  places totalt:       ${stats.total} (aktive ${stats.active})`);
  console.log(`  med opening_hours:   ${stats.with_oh} (valid ${stats.oh_valid})`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
