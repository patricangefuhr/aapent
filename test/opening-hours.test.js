'use strict';
// Determinisme: tving Europe/Oslo før noe Date brukes.
process.env.TZ = 'Europe/Oslo';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const oh = require('../src/lib/opening-hours');

// Faste, entydige tidspunkt (ISO med eksplisitt offset).
const MON_0630 = new Date('2026-08-31T06:30:00+02:00'); // mandag, før åpning
const MON_1000 = new Date('2026-08-31T10:00:00+02:00'); // mandag, i åpningstid
const SUN_1200 = new Date('2026-08-30T12:00:00+02:00'); // søndag
const XMAS_1200 = new Date('2026-12-25T12:00:00+01:00'); // 1. juledag (norsk PH), vinter

test('vanlig mandag i åpningstid -> OPEN, stenger 23:00', () => {
  const r = oh.evaluate('Mo-Fr 07:00-23:00', MON_1000);
  assert.equal(r.state, 'OPEN');
  assert.equal(r.is_24_7, false);
  assert.equal(oh.fmtTime(r.closes_at), '23:00');
});

test('åpner senere samme dag -> CLOSED, next_opens_at samme morgen', () => {
  const r = oh.evaluate('Mo-Fr 07:00-23:00', MON_0630);
  assert.equal(r.state, 'CLOSED');
  assert.equal(oh.fmtWeekdayTime(r.next_opens_at), 'mandag kl. 07:00');
});

test('vanlig søndag med Mo-Sa -> CLOSED (stengt søndag), åpner mandag', () => {
  const r = oh.evaluate('Mo-Sa 08:00-22:00', SUN_1200);
  assert.equal(r.state, 'CLOSED');
  assert.equal(oh.fmtWeekdayTime(r.next_opens_at), 'mandag kl. 08:00');
});

test('søndagsåpen butikk på søndag -> OPEN', () => {
  const r = oh.evaluate('Mo-Su 09:00-21:00', SUN_1200);
  assert.equal(r.state, 'OPEN');
  assert.equal(oh.fmtTime(r.closes_at), '21:00');
});

test('24/7 -> OPEN og is_24_7=true', () => {
  const r = oh.evaluate('24/7', SUN_1200);
  assert.equal(r.state, 'OPEN');
  assert.equal(r.is_24_7, true);
  assert.equal(r.closes_at, null);
});

test('manglende opening_hours -> UNKNOWN (aldri CLOSED)', () => {
  for (const v of [undefined, null, '', '   ']) {
    const r = oh.evaluate(v, MON_1000);
    assert.equal(r.state, 'UNKNOWN', `verdi=${JSON.stringify(v)}`);
    assert.notEqual(r.state, 'CLOSED');
  }
});

test('ugyldig opening_hours -> INVALID (aldri CLOSED)', () => {
  const r = oh.evaluate('dette er ikke åpningstider', MON_1000);
  assert.equal(r.state, 'INVALID');
  assert.notEqual(r.state, 'CLOSED');
  assert.ok(r.comment && r.comment.length > 0);
});

test('norsk helligdag: PH off stenger butikken på 1. juledag', () => {
  const r = oh.evaluate('Mo-Su 09:00-21:00; PH off', XMAS_1200);
  assert.equal(r.state, 'CLOSED');
  // Samme uttrykk uten helligdag er åpent
  const normal = oh.evaluate('Mo-Su 09:00-21:00; PH off', new Date('2026-12-18T12:00:00+01:00'));
  assert.equal(normal.state, 'OPEN');
});

test('UNKNOWN og INVALID teller ikke som åpen (isOpenAt)', () => {
  assert.equal(oh.isOpenAt('', MON_1000), false);
  assert.equal(oh.isOpenAt('junk junk', MON_1000), false);
  assert.equal(oh.isOpenAt('Mo-Fr 07:00-23:00', MON_1000), true);
});

test('validate: gyldig vs ugyldig vs tom', () => {
  assert.equal(oh.validate('Mo-Su 08:00-20:00').valid, true);
  assert.equal(oh.validate('').valid, false);
  assert.equal(oh.validate('tullestreng %%').valid, false);
});
