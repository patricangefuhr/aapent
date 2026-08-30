'use strict';
require('./load-env');
/**
 * Kjør alle SQL-migrasjoner i supabase/migrations (sortert) mot DATABASE_URL.
 * Erstatter psql. Idempotente migrasjoner kan kjøres flere ganger.
 * Bruk: node scripts/migrate.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('FEIL: mangler DATABASE_URL'); process.exit(1); }
  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  const client = new Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  await client.connect();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`  ▶ ${f} … `);
    try { await client.query(sql); console.log('OK'); }
    catch (e) { console.log('FEIL'); console.error('    ' + e.message); await client.end(); process.exit(1); }
  }
  // Bekreft
  const r = await client.query("select postgis_version() as pg");
  const t = await client.query("select count(*)::int c from information_schema.tables where table_schema='public' and table_name in ('places','place_sources','import_runs')");
  console.log(`\n  PostGIS: ${r.rows[0].pg}`);
  console.log(`  Tabeller opprettet: ${t.rows[0].c}/3`);
  await client.end();
  console.log('\n════ MIGRASJON FULLFØRT ════');
}
main().catch(e => { console.error(e); process.exit(1); });
