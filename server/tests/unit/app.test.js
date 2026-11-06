import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'unit-test-secret';
const { createApp } = await import('../../src/app.js');
const app = createApp();

// These run without a database.

test('health check', async () => {
  const res = await request(app).get('/api/health');
  assert.deepEqual(res.body, { ok: true });
});

test('every money route needs a login', async () => {
  const routes = [
    ['get', '/api/wallet'],
    ['post', '/api/wallet/topup'],
    ['post', '/api/transfers'],
    ['get', '/api/transfers/lookup?to=a@paylite'],
    ['get', '/api/requests'],
    ['get', '/api/transactions'],
  ];
  for (const [method, path] of routes) {
    const res = await request(app)[method](path);
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  }
});

test('forged and expired tokens are rejected', async () => {
  const forged = jwt.sign({ sub: '64b7f0f0f0f0f0f0f0f0f0f0' }, 'wrong-secret');
  const expired = jwt.sign({ sub: '64b7f0f0f0f0f0f0f0f0f0f0', exp: Math.floor(Date.now() / 1000) - 10 }, 'unit-test-secret');
  for (const token of [forged, expired]) {
    const res = await request(app).get('/api/wallet').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
  }
});

test('money-moving routes require an Idempotency-Key', async () => {
  const token = jwt.sign({ sub: '64b7f0f0f0f0f0f0f0f0f0f0' }, 'unit-test-secret');
  const res = await request(app)
    .post('/api/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send({ to: 'ravi@paylite', amount: '10', pin: '1234' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
});

test('security headers are set', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});
