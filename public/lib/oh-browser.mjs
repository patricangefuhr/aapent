// Browser-motor for åpningstider. Bygger på opening_hours.js (ESM).
// Deterministisk mot Europe/Oslo uansett enhetens tidssone: vi evaluerer mot en
// Date hvis LOKALE komponenter er satt lik Oslo-veggklokke.
import OpeningHours from './opening_hours.esm.mjs';

const NO_NOMINATIM = { lat: 59.91, lon: 10.75, address: { country_code: 'no', state: 'Oslo' } };

// Date hvis lokale felter == Oslo-veggklokke på tidspunktet d.
export function osloWall(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t) => Number(parts.find((x) => x.type === t).value);
  let h = g('hour'); if (h === 24) h = 0;
  return new Date(g('year'), g('month') - 1, g('day'), h, g('minute'), g('second'));
}

function build(s) { return new OpeningHours(String(s), NO_NOMINATIM, { tag_key: 'opening_hours' }); }

// Formatér veggklokke-Date (lokale komponenter = Oslo) uten dobbel tz-konvertering.
function fmtTime(d) {
  if (!d) return null;
  return new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
function fmtWeekdayTime(d) {
  if (!d) return null;
  return new Intl.DateTimeFormat('nb-NO', { weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/**
 * @returns {{state:'OPEN'|'CLOSED'|'UNKNOWN'|'INVALID', is_24_7:boolean, closes_at:Date|null, next_opens_at:Date|null, label:string, dot:string}}
 */
export function evaluate(ohString, at = new Date()) {
  const wall = osloWall(at);
  if (ohString == null || String(ohString).trim() === '') return decorate({ state: 'UNKNOWN' });
  let oh;
  try { oh = build(ohString); } catch { return decorate({ state: 'INVALID' }); }

  const unknown = oh.getUnknown(wall);
  const open = oh.getState(wall);
  const next = oh.getNextChange(wall);
  const is_24_7 = open && next === undefined;

  if (unknown && !open) return decorate({ state: 'UNKNOWN' });
  if (open) return decorate({ state: 'OPEN', is_24_7, closes_at: is_24_7 ? null : (next || null) });
  return decorate({ state: 'CLOSED', next_opens_at: next || null });
}

// Er butikken åpen på et gitt tidspunkt? (til søndagsfilter)
export function isOpenAt(ohString, at) { return evaluate(ohString, at).state === 'OPEN'; }

// Pen visning av rå-verdien.
export function prettify(ohString) {
  try { return build(ohString).prettifyValue(); } catch { return ohString || null; }
}

const DOT = { OPEN: '🟢', CLOSED: '🔴', UNKNOWN: '⚪', INVALID: '⚪' };
function decorate(r) {
  const o = { is_24_7: false, closes_at: null, next_opens_at: null, ...r };
  if (o.state === 'OPEN') o.label = o.is_24_7 ? 'Døgnåpent' : `Åpent til ${fmtTime(o.closes_at)}`;
  else if (o.state === 'CLOSED') o.label = o.next_opens_at ? `Stengt · åpner ${fmtWeekdayTime(o.next_opens_at)}` : 'Stengt';
  else o.label = 'Åpningstid ukjent';
  o.dot = DOT[o.state];
  return o;
}

// Neste (eller nåværende) søndag kl. 12:00 i Oslo-veggklokke — til "søndagsåpent"-filter.
export function targetSunday(now = new Date()) {
  const w = osloWall(now);
  const day = w.getDay(); // 0 = søndag
  if (day === 0) return w; // i dag er søndag -> bruk nå
  const s = new Date(w); s.setDate(w.getDate() + (7 - day)); s.setHours(12, 0, 0, 0);
  return s;
}

export { fmtTime, fmtWeekdayTime };
