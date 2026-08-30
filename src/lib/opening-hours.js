'use strict';
/**
 * Åpningstidsmotor for Søndagsåpent.
 *
 * Bygger på biblioteket `opening_hours` (opening_hours.js). Vi implementerer IKKE egen parser.
 *
 * Determinisme: all evaluering skjer i Europe/Oslo. Kjør prosessen med TZ=Europe/Oslo
 * (Norge er én tidssone; DST håndteres av Date + biblioteket). Funksjonen er ren:
 * gitt (opening_hours, tidspunkt) er svaret determinstisk og testbart.
 *
 * Norske helligdager (PH) beregnes av opening_hours.js via nominatim-objektet under
 * (country_code 'no'), slik at regler som "PH off" evalueres mot faktisk helligdag.
 */

const OpeningHours = require('opening_hours');

const TZ = 'Europe/Oslo';

// Nominatim-objekt slik at biblioteket slår opp norske helligdager (PH) og evt. state-holidays.
const NO_NOMINATIM = {
  lat: 59.91,
  lon: 10.75,
  address: { country_code: 'no', state: 'Oslo' },
};

const STATE = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  UNKNOWN: 'UNKNOWN',
  INVALID: 'INVALID',
});

/**
 * Bygg et opening_hours-objekt. Kaster hvis strengen er ugyldig.
 */
function build(ohString) {
  return new OpeningHours(String(ohString), NO_NOMINATIM, { tag_key: 'opening_hours' });
}

/**
 * Er denne strengen et gyldig opening_hours-uttrykk?
 * @returns {{valid: boolean, error: string|null}}
 */
function validate(ohString) {
  if (ohString == null || String(ohString).trim() === '') {
    return { valid: false, error: 'empty' };
  }
  try {
    build(ohString);
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * Evaluer status for en butikk på et gitt tidspunkt.
 *
 * @param {string|null|undefined} ohString - rå OSM opening_hours
 * @param {Date} [at=new Date()] - tidspunkt (tolkes i Europe/Oslo når prosessen kjører med TZ=Europe/Oslo)
 * @returns {{
 *   state: 'OPEN'|'CLOSED'|'UNKNOWN'|'INVALID',
 *   is_24_7: boolean,
 *   closes_at: Date|null,
 *   next_opens_at: Date|null,
 *   comment: string|undefined
 * }}
 */
function evaluate(ohString, at = new Date()) {
  // Manglende åpningstid => UNKNOWN. ALDRI CLOSED.
  if (ohString == null || String(ohString).trim() === '') {
    return base('UNKNOWN');
  }

  let oh;
  try {
    oh = build(ohString);
  } catch (e) {
    // Ugyldig/ikke-tolkbar åpningstid => INVALID (vises som "ukjent" i UI, aldri stengt).
    return { ...base('INVALID'), comment: e && e.message ? e.message : String(e) };
  }

  const isUnknown = oh.getUnknown(at);        // eksplisitt "unknown"-modifier i verdien
  const isOpen = oh.getState(at);             // true = åpen
  const comment = oh.getComment(at) || undefined;
  const nextChange = oh.getNextChange(at);    // Date, eller undefined hvis ingen endring (f.eks. 24/7)

  // 24/7: åpen nå OG ingen kommende tilstandsendring.
  const is_24_7 = isOpen && (nextChange === undefined);

  if (isUnknown && !isOpen) {
    // Verdien sier eksplisitt "unknown" på dette tidspunktet.
    return { ...base('UNKNOWN'), comment };
  }

  if (isOpen) {
    return {
      state: STATE.OPEN,
      is_24_7,
      closes_at: is_24_7 ? null : (nextChange || null),
      next_opens_at: null,
      comment,
    };
  }

  // Stengt nå -> når åpner den neste gang?
  return {
    state: STATE.CLOSED,
    is_24_7: false,
    closes_at: null,
    next_opens_at: nextChange || null,
    comment,
  };
}

function base(state) {
  return { state, is_24_7: false, closes_at: null, next_opens_at: null, comment: undefined };
}

/**
 * Er butikken faktisk åpen på et gitt tidspunkt? (bekvemmelighet for søndagsfilter)
 * UNKNOWN/INVALID teller IKKE som åpen.
 */
function isOpenAt(ohString, at) {
  return evaluate(ohString, at).state === STATE.OPEN;
}

/**
 * Formatér et tidspunkt som norsk klokkeslett (HH:MM) i Europe/Oslo.
 */
function fmtTime(date) {
  if (!date) return null;
  return new Intl.DateTimeFormat('nb-NO', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
  }).format(date);
}

/**
 * Formatér "ukedag HH:MM" i Europe/Oslo (til "åpner mandag 07:00").
 */
function fmtWeekdayTime(date) {
  if (!date) return null;
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ,
  }).format(date);
}

module.exports = {
  STATE, TZ,
  evaluate, validate, isOpenAt,
  fmtTime, fmtWeekdayTime,
  build, NO_NOMINATIM,
};
