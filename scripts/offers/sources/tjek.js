'use strict';
/**
 * Kilde: Tjek / eTilbudsavis (samme backend som etilbudsavis.no).
 * Dokumentert offentlig API (squid-api.tjek.com). Returnerer strukturerte tilbud
 * (produkt, pris, førpris, bilde, gyldighet) tagget med kjede via dealer.name.
 *
 * MERK (til vurdering før permanent produksjonsavhengighet): tredjeparts aggregator.
 * Bekreft bruksvilkår/attribusjon. Adapter-mønsteret gjør kilden lett å bytte.
 */
const { toChain } = require('../chain-map');

const UA = 'Sondagsapent/0.1 (+https://sondagsapent.no)';
const BASE = 'https://squid-api.tjek.com/v2/offers';
// Geografiske ankerpunkt for å fange nasjonale/regionale kjedeaviser over hele Norge.
const ANCHORS = [
  { name: 'Oslo', lat: 59.913, lng: 10.752 }, { name: 'Bergen', lat: 60.39, lng: 5.32 },
  { name: 'Trondheim', lat: 63.43, lng: 10.40 }, { name: 'Stavanger', lat: 58.97, lng: 5.73 },
  { name: 'Tromsø', lat: 69.65, lng: 18.96 }, { name: 'Kristiansand', lat: 58.15, lng: 8.00 },
  { name: 'Bodø', lat: 67.28, lng: 14.40 }, { name: 'Ålesund', lat: 62.47, lng: 6.15 },
];
const RADIUS = 25000, PER = 100, MAX_PAGES = 4;

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`Tjek ${r.status}`);
  return r.json();
}

const isoDate = (x) => x ? new Date(x).toISOString().slice(0, 10) : null;
function unitPrice(desc) {
  const m = (desc || '').match(/pr\.?\s*(kg|l|stk)\s*([\d.,]+)/i);
  return m ? `${m[2].replace('.', ',')} kr/${m[1].toLowerCase()}` : null;
}
function normalize(o, chain) {
  const p = o.pricing || {};
  return {
    chain,
    product_name: (o.heading || '').trim(),
    description: (o.description || '').split('\n')[0].trim() || null,
    current_price: p.price != null ? Number(p.price) : null,
    previous_price: p.pre_price != null ? Number(p.pre_price) : null,
    unit_price: unitPrice(o.description),
    image_url: (o.images && (o.images.view || o.images.thumb)) || null,
    valid_from: isoDate(o.run_from),
    valid_to: isoDate(o.run_till),
    source_url: `https://squid-api.tjek.com/v2/offers/${o.id}`,
    source: 'tjek',
    scope: 'national',
    store_id: null,
  };
}

async function fetchOffers(log = () => {}) {
  const byId = new Map();
  for (const a of ANCHORS) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${BASE}?r_lat=${a.lat}&r_lng=${a.lng}&r_radius=${RADIUS}&limit=${PER}&offset=${page * PER}`;
      let arr;
      try { arr = await getJson(url); } catch (e) { log(`  ${a.name} p${page}: ${e.message}`); break; }
      if (!Array.isArray(arr) || arr.length === 0) break;
      for (const o of arr) byId.set(o.id, o);
      if (arr.length < PER) break;
    }
    log(`  ${a.name}: ${byId.size} unike så langt`);
  }
  const out = [];
  for (const o of byId.values()) {
    const chain = toChain(o.dealer && o.dealer.name);
    if (!chain || !o.heading) continue;
    out.push(normalize(o, chain));
  }
  return out;
}

module.exports = { name: 'tjek', fetchOffers };
