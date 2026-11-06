import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startDb, stopDb, app, makeUser, send, balanceOf, request } from './helpers.js';
import { TopupOrder } from '../../src/models/TopupOrder.js';
import { config } from '../../src/config.js';
import { reconcileAll } from '../../src/services/reconcile.js';

before(startDb);
after(stopDb);

const thisMonth = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);

// ---------- categories and insights ----------

test('payments are categorised from the note; the payee sees Income', async () => {
  const asha = await makeUser({ topupRupees: 1000 });
  const ravi = await makeUser();

  const res = await send(asha, ravi.handle, '250', { note: 'Swiggy dinner' });
  assert.equal(res.body.transaction.category, 'Food & Dining');

  const ashaHistory = await request(app).get('/api/transactions?limit=1').set(asha.auth);
  assert.equal(ashaHistory.body.items[0].category, 'Food & Dining');
  const raviHistory = await request(app).get('/api/transactions?limit=1').set(ravi.auth);
  assert.equal(raviHistory.body.items[0].category, 'Income');
});

test('category is remembered per payee and can be re-labelled', async () => {
  const asha = await makeUser({ topupRupees: 1000 });
  const landlord = await makeUser();

  await send(asha, landlord.handle, '100', { note: 'November', category: 'Rent' });
  const suggestion = await request(app)
    .get(`/api/transfers/suggest-category?to=${landlord.handle}&note=December`)
    .set(asha.auth);
  assert.deepEqual(suggestion.body, { category: 'Rent', source: 'history' });

  // A keyword in the note wins over history.
  const fromNote = await request(app)
    .get(`/api/transfers/suggest-category?to=${landlord.handle}&note=uber%20ride`)
    .set(asha.auth);
  assert.equal(fromNote.body.category, 'Transport');

  // Sending without a category uses the suggestion.
  const second = await send(asha, landlord.handle, '100', { note: 'December' });
  assert.equal(second.body.transaction.category, 'Rent');

  const entry = (await request(app).get('/api/transactions?limit=1').set(asha.auth)).body.items[0];
  const relabel = await request(app)
    .patch(`/api/transactions/${entry.id}/category`)
    .set(asha.auth)
    .send({ category: 'Bills & Utilities' });
  assert.equal(relabel.body.category, 'Bills & Utilities');

  // The landlord cannot re-label Asha's entry, and nobody can re-label money received.
  const other = await request(app).patch(`/api/transactions/${entry.id}/category`).set(landlord.auth).send({ category: 'Rent' });
  assert.equal(other.status, 404);
  const received = (await request(app).get('/api/transactions?limit=1').set(landlord.auth)).body.items[0];
  const recv = await request(app).patch(`/api/transactions/${received.id}/category`).set(landlord.auth).send({ category: 'Rent' });
  assert.equal(recv.status, 404);

  const bad = await request(app).patch(`/api/transactions/${entry.id}/category`).set(asha.auth).send({ category: 'Bitcoin' });
  assert.equal(bad.status, 400);
});

test('insights: spending by category, income, top payees, budgets and alerts', async () => {
  const asha = await makeUser({ topupRupees: 5000 });
  const ravi = await makeUser({ name: 'Ravi Kumar' });
  const priya = await makeUser({ name: 'Priya Shah', topupRupees: 1000 });

  await send(asha, ravi.handle, '900', { note: 'Goa trip hotel' }); // Travel
  await send(asha, ravi.handle, '300.50', { note: 'zomato' }); // Food & Dining
  await send(asha, priya.handle, '100', { note: 'misc' }); // Other
  await send(priya, asha.handle, '400', { note: 'paying you back' }); // Asha: Income

  const month = thisMonth();
  await request(app).put('/api/insights/budgets').set(asha.auth).send({ category: 'Travel', month, amount: '1000' });
  await request(app).put('/api/insights/budgets').set(asha.auth).send({ category: 'Food & Dining', month, amount: '250' });
  await request(app).put('/api/insights/budgets').set(asha.auth).send({ category: 'Shopping', month, amount: '500' });
  // Saving again updates the same budget.
  await request(app).put('/api/insights/budgets').set(asha.auth).send({ category: 'Shopping', month, amount: '600' });

  const res = await request(app).get(`/api/insights?month=${month}`).set(asha.auth);
  assert.equal(res.status, 200);
  const s = res.body;

  assert.equal(s.spentPaise, 90000 + 30050 + 10000);
  assert.equal(s.receivedPaise, 40000); // the ₹5,000 top-up is not income
  assert.deepEqual(
    s.byCategory.map((c) => [c.category, c.totalPaise]),
    [['Travel', 90000], ['Food & Dining', 30050], ['Other', 10000]],
  );
  assert.equal(s.trend.length, 6);
  assert.equal(s.trend.at(-1).month, month);
  assert.equal(s.trend.at(-1).spentPaise, 130050);

  assert.equal(s.topPayees[0].name, 'Ravi Kumar');
  assert.equal(s.topPayees[0].totalPaise, 120050);
  assert.equal(s.topPayees[0].count, 2);

  assert.equal(s.budgets.length, 3);
  const byCat = Object.fromEntries(s.budgets.map((b) => [b.category, b]));
  assert.equal(byCat.Travel.status, 'warning'); // 90%
  assert.equal(byCat['Food & Dining'].status, 'exceeded'); // 120%
  assert.equal(byCat['Food & Dining'].remainingPaise, -5050);
  assert.equal(byCat.Shopping.amountPaise, 60000);
  assert.equal(byCat.Shopping.status, 'ok');
  assert.deepEqual(s.alerts.map((a) => a.category), ['Food & Dining', 'Travel']);

  const other = await request(app).get(`/api/insights?month=${month}`).set(ravi.auth);
  assert.equal(other.body.spentPaise, 0);
  assert.equal(other.body.budgets.length, 0);

  const bad = await request(app).get('/api/insights?month=2026-13').set(asha.auth);
  assert.equal(bad.status, 400);
});

// ---------- Razorpay top-up ----------

const sign = (text, secret) => crypto.createHmac('sha256', secret).update(text).digest('hex');
const checkoutSig = (orderId, paymentId) => sign(`${orderId}|${paymentId}`, 'test_key_secret');

function webhook(body, signature) {
  const raw = JSON.stringify(body);
  return request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', signature ?? sign(raw, 'test_webhook_secret'))
    .send(raw);
}

const capturedEvent = (orderId, paymentId, amount) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, status: 'captured' } } },
});

async function newOrder(user, amountPaise) {
  const orderId = `order_${crypto.randomBytes(7).toString('hex')}`;
  await TopupOrder.create({ userId: user.user.id, orderId, amountPaise });
  return orderId;
}

test('creating an order calls Razorpay with the server-side amount', async () => {
  const asha = await makeUser();
  const realFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return { ok: true, json: async () => ({ id: 'order_mock123', amount: sent.body.amount, currency: 'INR' }) };
  };
  try {
    const res = await request(app).post('/api/wallet/topup/order').set(asha.auth).send({ amount: '499.99' });
    assert.equal(res.status, 201);
    assert.equal(res.body.orderId, 'order_mock123');
    assert.equal(res.body.keyId, 'rzp_test_dummy');
    assert.equal(sent.url, 'https://api.razorpay.com/v1/orders');
    assert.equal(sent.body.amount, 49999);
    assert.equal(sent.auth, `Basic ${Buffer.from('rzp_test_dummy:test_key_secret').toString('base64')}`);
    assert.equal((await TopupOrder.findOne({ orderId: 'order_mock123' })).status, 'created');

    const tooBig = await request(app).post('/api/wallet/topup/order').set(asha.auth).send({ amount: '50000.01' });
    assert.equal(tooBig.body.error.code, 'LIMIT_TOPUP');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('checkout signature: forged is refused, real credits once, repeat does not credit again', async () => {
  const asha = await makeUser();
  const orderId = await newOrder(asha, 50000);

  const forged = await request(app)
    .post('/api/wallet/topup/verify')
    .set(asha.auth)
    .send({ orderId, paymentId: 'pay_x', signature: checkoutSig(orderId, 'pay_other') });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error.code, 'BAD_SIGNATURE');
  assert.equal(await balanceOf(asha), 0);

  const body = { orderId, paymentId: 'pay_real1', signature: checkoutSig(orderId, 'pay_real1') };
  const ok = await request(app).post('/api/wallet/topup/verify').set(asha.auth).send(body);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.balancePaise, 50000);
  assert.equal(ok.body.transaction.category, 'Wallet top-up');

  const again = await request(app).post('/api/wallet/topup/verify').set(asha.auth).send(body);
  assert.equal(again.status, 200);
  assert.equal(again.body.transaction.reference, ok.body.transaction.reference);
  assert.equal(await balanceOf(asha), 50000);

  // Another user cannot claim Asha's order.
  const ravi = await makeUser();
  const steal = await request(app).post('/api/wallet/topup/verify').set(ravi.auth).send(body);
  assert.equal(steal.status, 404);
});

test('webhook: bad signature refused; credits if the browser never came back; duplicates are safe', async () => {
  const asha = await makeUser();
  const orderId = await newOrder(asha, 20000);
  const event = capturedEvent(orderId, 'pay_wh1', 20000);

  const bad = await webhook(event, 'deadbeef');
  assert.equal(bad.status, 400);
  assert.equal(await balanceOf(asha), 0);

  assert.equal((await webhook(event)).status, 200);
  assert.equal((await webhook(event)).status, 200); // Razorpay retried
  assert.equal(await balanceOf(asha), 20000);

  // The browser's verify call arriving later returns the same top-up.
  const late = await request(app)
    .post('/api/wallet/topup/verify')
    .set(asha.auth)
    .send({ orderId, paymentId: 'pay_wh1', signature: checkoutSig(orderId, 'pay_wh1') });
  assert.equal(late.status, 200);
  assert.equal(late.body.balancePaise, 20000);

  // Orders this app did not create are acknowledged and ignored.
  assert.equal((await webhook(capturedEvent('order_not_ours', 'pay_z', 100))).status, 200);
});

test('webhook and browser confirming at the same moment credit once; wrong amount never credits', async () => {
  const asha = await makeUser();
  const orderId = await newOrder(asha, 30000);
  const [a, b] = await Promise.all([
    webhook(capturedEvent(orderId, 'pay_race', 30000)),
    request(app)
      .post('/api/wallet/topup/verify')
      .set(asha.auth)
      .send({ orderId, paymentId: 'pay_race', signature: checkoutSig(orderId, 'pay_race') }),
  ]);
  assert.equal(a.status, 200);
  assert.ok([200, 201].includes(b.status));
  assert.equal(await balanceOf(asha), 30000);

  const ravi = await makeUser();
  const wrongAmount = await newOrder(ravi, 10000);
  const res = await webhook(capturedEvent(wrongAmount, 'pay_wrong', 1));
  assert.equal(res.status, 409);
  assert.equal(await balanceOf(ravi), 0);
  assert.equal((await TopupOrder.findOne({ orderId: wrongAmount })).status, 'created');
});

test('demo top-up is switched off when Razorpay is on', async () => {
  const asha = await makeUser();
  config.allowDemoTopup = false;
  try {
    const res = await request(app).post('/api/wallet/topup').set(asha.auth).set('Idempotency-Key', crypto.randomUUID()).send({ amount: '100' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'DEMO_TOPUP_DISABLED');
    const wallet = await request(app).get('/api/wallet').set(asha.auth);
    assert.equal(wallet.body.topupMode, 'razorpay');
  } finally {
    config.allowDemoTopup = true;
  }
});

test('ledger still balances after every feature above', async () => {
  const report = await reconcileAll();
  assert.equal(report.ok, true, JSON.stringify(report));
});
