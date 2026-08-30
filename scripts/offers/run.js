'use strict';
require('../load-env');
/**
 * Tilbuds-import. Egen pipeline, adskilt fra åpningstider.
 * - Én kilde per adapter (nå: Tjek/eTilbudsavis). Flere kan legges til.
 * - Per-kjede isolert: én kjede kan feile uten å velte resten.
 * - Idempotent: erstatter aktive tilbud per (kilde, kjede) hver kjøring.
 * - Lagrer alltid source + source_url + gyldighetsperiode.
 *
 * Krever env: DATABASE_URL. Bruk: node scripts/offers/run.js
 */
const { Client } = require('pg');

const SOURCES = [require('./sources/tjek')];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('FEIL: mangler DATABASE_URL'); process.exit(1); }
  const client = new Client({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false } });
  await client.connect();

  // kjede-oppslag
  const chains = new Map();
  for (const r of (await client.query('select id, canonical from chains')).rows) chains.set(r.canonical, r.id);

  let grandTotal = 0;
  for (const source of SOURCES) {
    console.log(`\n══ kilde: ${source.name} ══`);
    let offers;
    try {
      offers = await source.fetchOffers((m) => console.log(m));
    } catch (e) {
      console.error(`  KILDE FEILET (${source.name}): ${e.message} — hopper over`);
      continue; // isolasjon: én kilde feiler ikke resten
    }
    console.log(`  hentet ${offers.length} tilbud`);

    // grupper per kjede
    const byChain = new Map();
    for (const o of offers) {
      if (!byChain.has(o.chain)) byChain.set(o.chain, []);
      byChain.get(o.chain).push(o);
    }

    for (const [chain, list] of byChain) {
      const chainId = chains.get(chain);
      if (!chainId) { console.log(`  ${chain}: ukjent kjede, hoppet over`); continue; }
      // dedup i JS (matcher unik-indeksen)
      const seen = new Set(); const uniq = [];
      for (const o of list) {
        const k = `${o.product_name}|${o.valid_from}|${o.valid_to}`;
        if (seen.has(k)) continue; seen.add(k); uniq.push(o);
      }
      try {
        await client.query('begin');
        // erstatt aktive tilbud for denne (kilde, kjede)
        await client.query('delete from offers where source=$1 and chain_id=$2', [source.name, chainId]);
        for (const o of uniq) {
          await client.query(
            `insert into offers (chain_id, store_id, product_name, description, current_price,
               previous_price, unit_price, image_url, valid_from, valid_to, source_url, source, scope)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [chainId, o.store_id, o.product_name, o.description, o.current_price, o.previous_price,
             o.unit_price, o.image_url, o.valid_from, o.valid_to, o.source_url, o.source, o.scope]);
        }
        await client.query('commit');
        console.log(`  ${chain.padEnd(12)} ${uniq.length} tilbud`);
        grandTotal += uniq.length;
      } catch (e) {
        await client.query('rollback');
        console.error(`  ${chain}: FEILET (${e.message}) — rullet tilbake, fortsetter`);
      }
    }
  }

  // rydd utløpte
  const del = await client.query('delete from offers where valid_to is not null and valid_to < current_date');
  const tot = (await client.query('select count(*)::int n from offers')).rows[0].n;
  await client.end();
  console.log(`\n════ TILBUDSIMPORT FERDIG ════`);
  console.log(`  importert denne kjøringen: ${grandTotal}`);
  console.log(`  ryddet utløpte:            ${del.rowCount}`);
  console.log(`  offers i basen totalt:     ${tot}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
