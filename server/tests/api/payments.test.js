import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startDb, stopDb, app, makeUser, send, balanceOf, newKey, request } from './helpers.js';
import { reconcileAll } from '../../src/services/reconcile.js';
import { Transaction } from '../../src/models/Transaction.js';

before(startDb);
after(stopDb);

test('sign up gives a PayLite ID, an empty wallet and no PIN yet', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Asha Verma', email: 'Asha.V@Example.com', password: 'password123' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.handle, 'asha.v@paylite');
  assert.equal(res.body.user.hasPin, false);

  const auth = { Authorization: `Bearer ${res.body.token}` };
  const wallet = await request(app).get('/api/wallet').set(auth);
  assert.equal(wallet.body.balancePaise, 0);

  const other = await makeUser();
  const noPin = await request(app)
    .post('/api/transfers')
    .set(auth)
    .set('Idempotency-Key', newKey())
    .send({ to: other.handle, amount: '1', pin: '1234' });
  assert.equal(noPin.status, 403);
  assert.equal(noPin.body.error.code, 'PIN_NOT_SET');
});

test('transfer moves exact paise and both sides see it', async () => {
  const asha = await makeUser({ topupRupees: 1000 });
  const ravi = await makeUser();

  const res = await send(asha, ravi.handle, '250.75', { note: 'Dinner' });
  assert.equal(res.status, 201);
  assert.equal(res.body.balancePaise, 100000 - 25075);
  assert.match(res.body.transaction.reference, /^PL[0-9A-F]{12}$/);
  assert.equal(res.body.transaction.counterparty.handle, ravi.handle);

  assert.equal(await balanceOf(ravi), 25075);

  const history = await request(app).get('/api/transactions').set(ravi.auth);
  assert.equal(history.body.items[0].direction, 'received');
  assert.equal(history.body.items[0].note, 'Dinner');
  assert.equal(history.body.items[0].counterparty.handle, asha.handle);
});

test('cannot overdraw, send to yourself, or send to an unknown ID', async () => {
  const asha = await makeUser({ topupRupees: 100 });
  const ravi = await makeUser();

  const tooMuch = await send(asha, ravi.handle, '100.01');
  assert.equal(tooMuch.status, 422);
  assert.equal(tooMuch.body.error.code, 'INSUFFICIENT_FUNDS');

  const self = await send(asha, asha.handle, '1');
  assert.equal(self.body.error.code, 'SAME_ACCOUNT');

  const unknown = await send(asha, 'nobody-here@paylite', '1');
  assert.equal(unknown.status, 404);

  assert.equal(await balanceOf(asha), 10000);
});

test('10 payments at the same moment can never overdraw the wallet', async () => {
  const asha = await makeUser({ topupRupees: 100 });
  const ravi = await makeUser();

  // ₹100 balance, ten ₹30 payments fired together: exactly three can succeed.
  const results = await Promise.all(Array.from({ length: 10 }, () => send(asha, ravi.handle, '30')));
  const ok = results.filter((r) => r.status === 201).length;
  const declined = results.filter((r) => r.body.error?.code === 'INSUFFICIENT_FUNDS').length;

  assert.equal(ok, 3);
  assert.equal(declined, 7);
  assert.equal(await balanceOf(asha), 1000);
  assert.equal(await balanceOf(ravi), 9000);
});

test('retrying with the same Idempotency-Key does not pay twice', async () => {
  const asha = await makeUser({ topupRupees: 500 });
  const ravi = await makeUser();
  const key = newKey();

  const first = await send(asha, ravi.handle, '100', { key });
  const retry = await send(asha, ravi.handle, '100', { key });
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(retry.headers['idempotent-replayed'], 'true');
  assert.equal(retry.body.transaction.reference, first.body.transaction.reference);
  assert.equal(await balanceOf(ravi), 10000);

  // Same key, different payment: a client bug, refused.
  const reused = await send(asha, ravi.handle, '200', { key });
  assert.equal(reused.status, 422);
  assert.equal(reused.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
});

test('the same key sent twice at the same moment still pays once', async () => {
  const asha = await makeUser({ topupRupees: 500 });
  const ravi = await makeUser();
  const key = newKey();

  const results = await Promise.all([send(asha, ravi.handle, '50', { key }), send(asha, ravi.handle, '50', { key })]);
  const statuses = results.map((r) => r.status).sort();
  // One pays; the other either replays the result or is told to retry.
  assert.ok(statuses.includes(201));
  assert.ok(statuses.every((s) => s === 201 || s === 409), `got ${statuses}`);
  assert.equal(await balanceOf(ravi), 5000);
});

test('a failed payment frees its key so the app can retry it', async () => {
  const asha = await makeUser({ topupRupees: 10 });
  const ravi = await makeUser();
  const key = newKey();

  const fail = await send(asha, ravi.handle, '50', { key });
  assert.equal(fail.body.error.code, 'INSUFFICIENT_FUNDS');

  await request(app).post('/api/wallet/topup').set(asha.auth).set('Idempotency-Key', newKey()).send({ amount: '100' });
  const retry = await send(asha, ravi.handle, '50', { key });
  assert.equal(retry.status, 201);
});

test('wrong PIN: attempts left, then locked for 15 minutes', async () => {
  const asha = await makeUser({ topupRupees: 100 });
  const ravi = await makeUser();

  const first = await send(asha, ravi.handle, '1', { pin: '0000' });
  assert.equal(first.status, 403);
  assert.equal(first.body.error.code, 'WRONG_PIN');
  assert.equal(first.body.error.attemptsLeft, 2);

  await send(asha, ravi.handle, '1', { pin: '0000' });
  const third = await send(asha, ravi.handle, '1', { pin: '0000' });
  assert.equal(third.status, 423);
  assert.equal(third.body.error.code, 'PIN_LOCKED');

  // Even the right PIN is refused while locked.
  const locked = await send(asha, ravi.handle, '1', { pin: '1234' });
  assert.equal(locked.body.error.code, 'PIN_LOCKED');
  assert.equal(await balanceOf(asha), 10000);
});

test('per-payment and daily limits', async () => {
  const asha = await makeUser({ topupRupees: 150_000 });
  const ravi = await makeUser();

  const huge = await send(asha, ravi.handle, '50000.01');
  assert.equal(huge.body.error.code, 'LIMIT_PER_TRANSACTION');

  assert.equal((await send(asha, ravi.handle, '50000')).status, 201);
  assert.equal((await send(asha, ravi.handle, '49999')).status, 201);
  const over = await send(asha, ravi.handle, '1.01');
  assert.equal(over.status, 422);
  assert.equal(over.body.error.code, 'LIMIT_DAILY');
  assert.match(over.body.error.message, /₹1\.00 more today/);

  // The failed payment was rolled back, including its daily-usage increment.
  assert.equal((await send(asha, ravi.handle, '1')).status, 201);
  const wallet = await request(app).get('/api/wallet').set(asha.auth);
  assert.equal(wallet.body.limits.remainingTodayPaise, 0);
});

test('velocity limit: at most 5 payments a minute', async () => {
  const asha = await makeUser({ topupRupees: 100 });
  const ravi = await makeUser();
  for (let i = 0; i < 5; i++) assert.equal((await send(asha, ravi.handle, '1')).status, 201);
  const sixth = await send(asha, ravi.handle, '1');
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.error.code, 'VELOCITY_LIMIT');
});

test('collect requests: pay once, decline, cancel, and who can do what', async () => {
  const asha = await makeUser();
  const ravi = await makeUser({ topupRupees: 1000 });

  const created = await request(app).post('/api/requests').set(asha.auth).send({ from: ravi.handle, amount: '300', note: 'Movie' });
  assert.equal(created.status, 201);
  const id = created.body.request.id;

  const incoming = await request(app).get('/api/requests?box=incoming').set(ravi.auth);
  assert.equal(incoming.body.items[0].id, id);
  assert.equal(incoming.body.items[0].counterparty.handle, asha.handle);

  // Asha cannot pay her own request.
  const wrongPayer = await request(app).post(`/api/requests/${id}/pay`).set(asha.auth).set('Idempotency-Key', newKey()).send({ pin: '1234' });
  assert.equal(wrongPayer.status, 404);

  // Ravi taps "Pay" on two devices at once: only one payment happens.
  const pays = await Promise.all([
    request(app).post(`/api/requests/${id}/pay`).set(ravi.auth).set('Idempotency-Key', newKey()).send({ pin: '1234' }),
    request(app).post(`/api/requests/${id}/pay`).set(ravi.auth).set('Idempotency-Key', newKey()).send({ pin: '1234' }),
  ]);
  assert.equal(pays.filter((p) => p.status === 201).length, 1);
  assert.equal(await balanceOf(asha), 30000);
  assert.equal(await balanceOf(ravi), 70000);

  const decline = await request(app).post(`/api/requests/${id}/decline`).set(ravi.auth);
  assert.equal(decline.body.error.code, 'REQUEST_NOT_PENDING');

  const second = await request(app).post('/api/requests').set(asha.auth).send({ from: ravi.handle, amount: '10' });
  const declined = await request(app).post(`/api/requests/${second.body.request.id}/decline`).set(ravi.auth);
  assert.equal(declined.body.request.status, 'declined');

  const third = await request(app).post('/api/requests').set(asha.auth).send({ from: ravi.handle, amount: '10' });
  const ravisCancel = await request(app).post(`/api/requests/${third.body.request.id}/cancel`).set(ravi.auth);
  assert.equal(ravisCancel.status, 404); // only the requester can cancel
  const cancelled = await request(app).post(`/api/requests/${third.body.request.id}/cancel`).set(asha.auth);
  assert.equal(cancelled.body.request.status, 'cancelled');
});

test('lookup shows the payee name before paying', async () => {
  const asha = await makeUser();
  const ravi = await makeUser({ name: 'Ravi Kumar' });
  const res = await request(app).get(`/api/transfers/lookup?to=${ravi.handle}`).set(asha.auth);
  assert.deepEqual(res.body, { name: 'Ravi Kumar', handle: ravi.handle, isSelf: false });
});

test('history uses cursor pagination without gaps or repeats', async () => {
  const asha = await makeUser({ topupRupees: 100 });
  const ravi = await makeUser();
  for (let i = 1; i <= 4; i++) await send(asha, ravi.handle, String(i));
  // asha has 5 entries: 1 top-up + 4 payments

  const page1 = await request(app).get('/api/transactions?limit=2').set(asha.auth);
  const page2 = await request(app).get(`/api/transactions?limit=2&cursor=${page1.body.nextCursor}`).set(asha.auth);
  const page3 = await request(app).get(`/api/transactions?limit=2&cursor=${page2.body.nextCursor}`).set(asha.auth);

  const amounts = [...page1.body.items, ...page2.body.items, ...page3.body.items].map((r) => r.amountPaise);
  assert.deepEqual(amounts, [400, 300, 200, 100, 10000]);
  assert.equal(page3.body.nextCursor, null);
  assert.equal(page3.body.items[0].type, 'topup');

  const sentOnly = await request(app).get('/api/transactions?direction=sent').set(asha.auth);
  assert.equal(sentOnly.body.items.length, 4);
});

test('CSV statement has running balances and blocks spreadsheet formulas', async () => {
  const asha = await makeUser({ topupRupees: 100 });
  const ravi = await makeUser();
  await send(asha, ravi.handle, '10', { note: '=HYPERLINK("http://evil")' });

  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await request(app).get(`/api/transactions/statement?from=${today}&to=${today}`).set(asha.auth);
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  const lines = res.text.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /,100\.00,100\.00$/); // top-up credit, balance 100
  assert.match(lines[2], /,10\.00,,90\.00$/); // payment debit, balance 90
  assert.ok(lines[2].includes(`"'=HYPERLINK(""http://evil"")"`));
});

test('every balance matches the ledger, and the ledger sums to zero', async () => {
  const asha = await makeUser({ topupRupees: 100 });
  const verify = await request(app).get('/api/wallet/verify').set(asha.auth);
  assert.equal(verify.body.matches, true);
  assert.equal(verify.body.ledgerBalancePaise, 10000);

  // Runs over everything every earlier test did, including the races.
  const report = await reconcileAll();
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(report.ledgerTotalPaise, 0);
  assert.ok((await Transaction.countDocuments()) > 30);
});

test('ids that are not ObjectIds are a clean 404', async () => {
  const asha = await makeUser();
  const res = await request(app).post('/api/requests/not-an-id/decline').set(asha.auth);
  assert.equal(res.status, 404);
  assert.ok(mongoose.connection.readyState === 1);
});
