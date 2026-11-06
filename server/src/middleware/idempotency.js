import crypto from 'node:crypto';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { AppError } from '../lib/errors.js';

// How long an unfinished request "owns" its key. A request that crashed
// before committing moved no money (the payment and the key's "completed"
// state are saved in one transaction), so after this time a retry may run it.
const STALE_AFTER_MS = 60 * 1000;

// JSON with sorted keys, so {a:1,b:2} and {b:2,a:1} hash the same.
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashRequest(req) {
  // The PIN is left out on purpose: a hash of a 4-digit PIN could be reversed
  // by trying all 10,000 values.
  const { pin, ...body } = req.body || {};
  return crypto
    .createHash('sha256')
    .update(`${req.method} ${req.baseUrl}${req.path} ${stableStringify(body)}`)
    .digest('hex');
}

// Every request that moves money must send an "Idempotency-Key" header: a
// random id the app creates once per payment attempt and re-sends on retry.
//
//  - First time a key is seen: the request runs. The payment service saves
//    the response under this key inside the payment's own transaction.
//  - Same key again, finished: the saved response is returned, nothing runs.
//  - Same key again, still running: 409, the app should wait and retry.
//  - Same key with a different body: 422, the app has a bug.
//  - If the request fails, the key is deleted (no money moved, since the
//    transaction rolled back), so the same key can be retried.
export function idempotent() {
  return async (req, res, next) => {
    try {
      const key = req.get('Idempotency-Key');
      if (!key || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) {
        throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Send a unique Idempotency-Key header with this request');
      }
      const requestHash = hashRequest(req);

      let record;
      try {
        record = await IdempotencyKey.create({ userId: req.userId, key, requestHash });
      } catch (err) {
        if (err.code !== 11000) throw err;
        const existing = await IdempotencyKey.findOne({ userId: req.userId, key });
        if (!existing) throw new AppError(409, 'REQUEST_IN_PROGRESS', 'Please retry');
        if (existing.requestHash !== requestHash) {
          throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request');
        }
        if (existing.state === 'completed') {
          res.set('Idempotent-Replayed', 'true');
          return res.status(existing.responseStatus).json(existing.responseBody);
        }
        // Still in progress. Take it over only if the first attempt is stale.
        record = await IdempotencyKey.findOneAndUpdate(
          { _id: existing._id, state: 'in_progress', createdAt: { $lt: new Date(Date.now() - STALE_AFTER_MS) } },
          { $set: { createdAt: new Date() } },
          { new: true },
        );
        if (!record) throw new AppError(409, 'REQUEST_IN_PROGRESS', 'This payment is already being processed');
      }

      req.idempotency = record;
      // Free the key if the request ends in an error, so it can be retried.
      res.on('finish', () => {
        if (res.statusCode >= 300) {
          IdempotencyKey.deleteOne({ _id: record._id, state: 'in_progress' }).catch(() => {});
        }
      });
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
