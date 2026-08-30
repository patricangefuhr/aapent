'use strict';
/**
 * Delt TSV-parser for Overpass CSV-uttrekk.
 *
 * VIKTIG: Overpass siterer felt som inneholder komma (eller anførselstegn) etter CSV-regler,
 * f.eks.  "Mo-Fr 07:00-20:00, Sa-Su 09:00-20:00"  — med bokstavelige anførselstegn.
 * Disse MÅ strippes, ellers tolker opening_hours.js hele strengen som en kommentar (=> UNKNOWN).
 */

function unquote(v) {
  if (v == null) return v;
  if (v.length >= 2 && v.charCodeAt(0) === 34 && v.charCodeAt(v.length - 1) === 34) {
    return v.slice(1, -1).replace(/""/g, '"');
  }
  return v;
}

/**
 * @param {string} text  hele TSV-innholdet
 * @param {string[]} cols  kolonnenavn i rekkefølge
 * @returns {{rows: object[], skipped: number}}
 */
function parseTSV(text, cols) {
  const lines = text.split('\n');
  const rows = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = lines[i].split('\t');
    if (f.length !== cols.length) { skipped++; continue; } // rader med linjeskift i sitert felt
    const o = {};
    cols.forEach((c, j) => { o[c] = unquote(f[j]); });
    rows.push(o);
  }
  return { rows, skipped };
}

module.exports = { parseTSV, unquote, COLS: [
  'type','id','lat','lon','name','brand','operator','shop','opening_hours',
  'addr_city','addr_postcode','addr_street','website','phone',
] };
