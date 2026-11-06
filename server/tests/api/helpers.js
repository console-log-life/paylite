import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'api-test-secret';
// Razorpay test credentials (no real calls are made: order creation is
// mocked in the tests). Demo top-ups stay on so tests can fund wallets.
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.ALLOW_DEMO_TOPUP = 'true';
const { createApp } = await import('../../src/app.js');
const { ensureSystemAccounts } = await import('../../src/services/accounts.js');

let replSet;
export let app;

// Transactions need a replica set, so the tests start a one-node replica set
// in memory (the same kind of setup as MongoDB Atlas, just local).
export async function startDb() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(replSet.getUri());
  await mongoose.syncIndexes();
  await ensureSystemAccounts();
  app = createApp();
}

export async function stopDb() {
  await mongoose.disconnect();
  await replSet?.stop();
}

export const newKey = () => crypto.randomUUID();

let n = 0;
// Registers a user, sets PIN 1234, and optionally adds money.
export async function makeUser({ topupRupees = 0, name } = {}) {
  n += 1;
  const email = `user${n}_${Date.now()}@example.com`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: name || `User ${n}`, email, password: 'password123' });
  if (reg.status !== 201) throw new Error(`register failed: ${JSON.stringify(reg.body)}`);
  const auth = { Authorization: `Bearer ${reg.body.token}` };

  const pin = await request(app).put('/api/auth/pin').set(auth).send({ pin: '1234', password: 'password123' });
  if (pin.status !== 200) throw new Error(`set pin failed: ${JSON.stringify(pin.body)}`);

  let remaining = topupRupees;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 50_000);
    const res = await request(app).post('/api/wallet/topup').set(auth).set('Idempotency-Key', newKey()).send({ amount: String(chunk) });
    if (res.status !== 201) throw new Error(`topup failed: ${JSON.stringify(res.body)}`);
    remaining -= chunk;
  }
  return { auth, user: reg.body.user, handle: reg.body.user.handle };
}

export function send(from, toHandle, amount, { pin = '1234', key = newKey(), note, category } = {}) {
  return request(app)
    .post('/api/transfers')
    .set(from.auth)
    .set('Idempotency-Key', key)
    .send({ to: toHandle, amount: String(amount), pin, note, category });
}

export async function balanceOf(user) {
  const res = await request(app).get('/api/wallet').set(user.auth);
  return res.body.balancePaise;
}

export { request };
