'use strict';
/**
 * Klassifisering av OSM shop-POI til dagligvarebutikk for Norge.
 *
 * Regler (MVP):
 *   shop=supermarket        -> alltid med
 *   shop=convenience        -> med KUN hvis dagligvare-kjede ELLER uavhengig uten kiosk/bensin-signal
 *   kiosk/bensin-brand/navn -> ut
 *   uavhengige butikker      -> beholdes (lav/medium confidence)
 *
 * Ingen hardkoding til kun kjedene: ukjente/uavhengige supermarkeder tas alltid med.
 */

// Kanoniske dagligvarekjeder. Nøkkel = canonical navn, verdi = regex mot brand/operator/name (lowercase).
const GROCERY_CHAINS = [
  ['KIWI',        /\bkiwi\b/],
  ['REMA 1000',   /\brema\b/],
  ['Coop Extra',  /coop\s*extra|(^|\s)extra(\s|$)/],
  ['Coop Prix',   /coop\s*prix/],
  ['Coop Mega',   /coop\s*mega/],
  ['Coop Marked', /coop\s*marked/],
  ['Coop Obs',    /\bobs\b|coop\s*obs/],
  ['Coop Mega',   /\bmega\b/],
  ['Matkroken',   /matkroken/],
  ['MENY',        /\bmeny\b/],
  ['EUROSPAR',    /eurospar/],
  ['SPAR',        /\bspar\b/],
  ['Joker',       /\bjoker\b/],
  ['Bunnpris',    /\bbunnpris\b/],
  ['Nærbutikken', /n(æ|ae)rbutikk/],
  ['Coop',        /\bcoop\b/],
];

// Kiosk / bensin / storkiosk — skal UT selv om tagget shop=convenience.
const FUEL_KIOSK = /\bnarvesen\b|7-?eleven|deli\s*de\s*luca|circle\s*k|\bshell\b|\besso\b|\byx\b|uno-?x|\bbest\b|\bgulf\b|\bjafs\b|\bhydro\b|\btotal\b|\bstatoil\b|\bmix\b|automat|bensin|drivstoff|gas\s*station|kiosk/;

function norm(s) { return (s == null ? '' : String(s)).toLowerCase().trim(); }

function detectChain(brand, operator, name) {
  const hay = [norm(brand), norm(operator), norm(name)].filter(Boolean).join(' | ');
  for (const [canonical, re] of GROCERY_CHAINS) {
    if (re.test(hay)) return canonical;
  }
  return null;
}

function isFuelKiosk(brand, operator, name) {
  const hay = [norm(brand), norm(operator), norm(name)].join(' | ');
  return FUEL_KIOSK.test(hay);
}

/**
 * @returns {{
 *   include: boolean,
 *   chain: string|null,
 *   category: 'supermarket'|'grocery_convenience'|'convenience_independent'|'excluded_fuel_kiosk'|'excluded_other',
 *   confidence: number,
 *   reason: string
 * }}
 */
function classify({ shop, brand, operator, name }) {
  const s = norm(shop);
  const chain = detectChain(brand, operator, name);
  const fuelKiosk = isFuelKiosk(brand, operator, name);

  if (s === 'supermarket') {
    // Supermarket tas alltid med. Bensin-brand på et supermarket er ekstremt sjeldent; behold likevel.
    return {
      include: true,
      chain,
      category: 'supermarket',
      confidence: chain ? 0.98 : 0.85,
      reason: chain ? `supermarket + kjede (${chain})` : 'supermarket, uavhengig',
    };
  }

  if (s === 'convenience') {
    if (chain) {
      return { include: true, chain, category: 'grocery_convenience', confidence: 0.9,
        reason: `convenience + dagligvarekjede (${chain})` };
    }
    if (fuelKiosk) {
      return { include: false, chain: null, category: 'excluded_fuel_kiosk', confidence: 0.9,
        reason: 'convenience med kiosk/bensin-signal' };
    }
    // Uavhengig convenience uten kiosk/bensin-signal: behold, men lav confidence (tvilssone).
    return { include: true, chain: null, category: 'convenience_independent', confidence: 0.45,
      reason: 'convenience, uavhengig, ingen kiosk/bensin-signal' };
  }

  // Andre shop-verdier hører ikke til MVP.
  return { include: false, chain: null, category: 'excluded_other', confidence: 0.5,
    reason: `shop=${s || '(tom)'} utenfor MVP` };
}

module.exports = { classify, detectChain, isFuelKiosk, GROCERY_CHAINS };
