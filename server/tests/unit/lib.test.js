import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPaise, paiseToRupees } from '../../src/lib/money.js';
import { istDayKey } from '../../src/lib/limits.js';
import { readHandle, readPin, readAmount } from '../../src/lib/validate.js';
import { stableStringify } from '../../src/middleware/idempotency.js';

test('toPaise converts text to exact integer paise', () => {
  assert.equal(toPaise('125'), 12500);
  assert.equal(toPaise('125.5'), 12550);
  assert.equal(toPaise('1,250.75'), 125075);
  assert.equal(toPaise('0.01'), 1);
  assert.equal(toPaise('1.15'), 115); // 1.15 * 100 would give 114.999...
  assert.equal(toPaise(99), 9900);
});

test('toPaise rejects anything that is not a positive amount with <= 2 decimals', () => {
  for (const bad of ['', ' ', 'abc', '-5', '0', '0.00', '1.234', '1e3', '12.', null, undefined, {}]) {
    assert.equal(toPaise(bad), null, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test('paiseToRupees formats for CSV and messages', () => {
  assert.equal(paiseToRupees(12550), '125.50');
  assert.equal(paiseToRupees(5), '0.05');
  assert.equal(paiseToRupees(-100), '-1.00');
});

test('daily limit day changes at midnight IST, not UTC', () => {
  // 18:29 UTC = 23:59 IST, still the 5th in India
  assert.equal(istDayKey(new Date('2026-11-05T18:29:00Z')), '2026-11-05');
  // 18:31 UTC = 00:01 IST on the 6th
  assert.equal(istDayKey(new Date('2026-11-05T18:31:00Z')), '2026-11-06');
});

test('PayLite IDs: adds @paylite, lower-cases, rejects junk', () => {
  assert.equal(readHandle('Ravi'), 'ravi@paylite');
  assert.equal(readHandle('ravi.k@PayLite'), 'ravi.k@paylite');
  assert.throws(() => readHandle('ra'), /valid PayLite ID/);
  assert.throws(() => readHandle('ravi@gmail.com'), /valid PayLite ID/);
});

test('PIN must be 4-6 digits; amount must be valid', () => {
  assert.equal(readPin('1234'), '1234');
  assert.throws(() => readPin('12a4'));
  assert.throws(() => readPin('1234567'));
  assert.throws(() => readPin(1234)); // must be a string, so leading zeros survive
  assert.throws(() => readAmount('-1'));
});

test('idempotency hashing ignores key order', () => {
  assert.equal(stableStringify({ b: 2, a: { d: 1, c: [1, { y: 1, x: 2 }] } }), stableStringify({ a: { c: [1, { x: 2, y: 1 }], d: 1 }, b: 2 }));
});
