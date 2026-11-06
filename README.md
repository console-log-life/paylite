# PayLite

A small UPI-style wallet: sign up, get a PayLite ID (`name@paylite`), add money, send money with a PIN, request money, and download statements.

The point of the project is the backend: how a payments system makes sure money is never lost, created, or sent twice, even when requests are retried or arrive at the same moment.

**Stack:** Node.js, Express, MongoDB (Mongoose, multi-document transactions), React 18, TypeScript, Vite, Tailwind CSS
**Tests:** Node.js test runner, Supertest, mongodb-memory-server (in-memory replica set)

## Features

- Sign up and log in (bcrypt passwords, JWT sessions); every user gets a PayLite ID
- Add money (simulated bank top-up) and send money to a PayLite ID, confirmed with a 4-6 digit PIN
- Payee name shown before paying, so a typo in an ID does not pay a stranger
- Collect requests: ask someone for money; they pay with their PIN or decline; you can cancel; requests expire after 7 days
- History with cursor pagination and sent/received filters; CSV statement for any date range
- Limits: ₹50,000 per payment, ₹1,00,000 per day (resets at midnight IST), 5 payments per minute
- PIN locked for 15 minutes after 3 wrong attempts
- "Verify my balance" check that compares the balance with the ledger

## How the money stays correct

### 1. Integer paise, never floats

In JavaScript `0.1 + 0.2 === 0.30000000000000004` and `1.15 * 100 === 114.99999999999999`. Every amount is stored as a whole number of paise (₹125.50 → `12550`), and the text the user types is converted without float maths (`server/src/lib/money.js`).

### 2. Double-entry ledger

Every payment writes a `Transaction` and two `LedgerEntry` rows: `-amount` for the payer and `+amount` for the payee. The entries of each transaction add up to zero, so money is only ever moved, never created or lost. Entries are append-only.

Money added from outside comes from a `SYSTEM_BANK` account, which goes negative by exactly the amount users have added. That keeps the total of all accounts at zero, and makes the whole system checkable:

```
npm run reconcile   # every transaction sums to 0, the ledger sums to 0,
                    # and every cached balance equals its ledger sum
```

Each account also keeps a cached `balancePaise` so a balance check is one read instead of summing every entry. It is only changed in the same transaction that writes the ledger entries.

### 3. MongoDB transactions

The debit, the credit, the transaction record, both ledger entries, the daily-limit counter and the idempotency record are written in one MongoDB transaction (`server/src/services/db.js`). Either all of them are saved or none are. If anything fails, such as the daily limit being crossed, everything rolls back.

### 4. No overdraft, even under concurrency

The debit is a single conditional update:

```js
Account.findOneAndUpdate(
  { _id: from, balancePaise: { $gte: amount } },
  { $inc: { balancePaise: -amount } },
  { session },
)
```

There is no "read the balance, then write it" gap. If two payments touch the same account at once, MongoDB lets one commit and the other is retried against the new balance. A test fires ten ₹30 payments at once from a ₹100 wallet: exactly three succeed and the balance ends at ₹10.

### 5. Idempotency keys: a retry never pays twice

Every request that moves money must send an `Idempotency-Key` header, a random id the app makes once per payment attempt (`server/src/middleware/idempotency.js`).

- First time a key is seen, the payment runs, and its response is saved under the key **inside the same transaction as the payment**. So either the money moved and the response is saved, or neither happened.
- The same key again returns the saved response (with `Idempotent-Replayed: true`) without running anything.
- The same key arriving while the first request is still running gets `409`, and the app retries.
- The same key with a different body gets `422`, because that is a bug in the client.
- If a payment fails, its key is released (nothing moved), so the app can retry.

The frontend re-sends the same key automatically if the network drops (`client/src/lib/api.ts`). The PIN is left out of the request hash, because a hash of a 4-digit PIN could be reversed by trying all 10,000 values.

### 6. Requests can be paid only once

Paying a collect request flips its status from `pending` to `paid` with a conditional update inside the payment transaction. If the payer taps "Pay" on two devices at once, one payment goes through and the other gets `409`.

### 7. Limits that hold under concurrency

The daily limit is a per-day counter document incremented inside the payment transaction. Two payments racing to the limit both write that one document, so MongoDB serialises them, and the one that would cross the limit rolls back.

## API

All routes except register, login and health need `Authorization: Bearer <token>`. Errors look like `{ "error": { "code": "INSUFFICIENT_FUNDS", "message": "..." } }`.

| Method | Route | Notes |
| --- | --- | --- |
| POST | `/api/auth/register` | name, email, password |
| POST | `/api/auth/login` | |
| GET | `/api/auth/me` | |
| PUT | `/api/auth/pin` | pin, password |
| GET | `/api/wallet` | balance and limits |
| POST | `/api/wallet/topup` | amount · **Idempotency-Key** |
| GET | `/api/wallet/verify` | cached balance vs ledger sum |
| GET | `/api/transfers/lookup?to=` | payee name for an ID |
| POST | `/api/transfers` | to, amount, note, pin · **Idempotency-Key** |
| GET | `/api/requests?box=incoming\|outgoing` | |
| POST | `/api/requests` | from, amount, note |
| POST | `/api/requests/:id/pay` | pin · **Idempotency-Key** |
| POST | `/api/requests/:id/decline` | payer only |
| POST | `/api/requests/:id/cancel` | requester only |
| GET | `/api/transactions?cursor=&limit=&direction=` | cursor pagination |
| GET | `/api/transactions/statement?from=&to=` | CSV download |

## Tests

```bash
cd server
npm test         # unit tests + API tests on an in-memory MongoDB replica set
npm run test:unit
```

The API tests cover: exact paise transfers, overdraft and self-payment, 10 concurrent payments, idempotent retries (sequential and simultaneous), key reuse, failed-payment key release, PIN lockout, per-payment/daily/velocity limits, collect requests paid from two devices at once, cursor pagination, CSV statements (including spreadsheet-formula injection), and a full ledger reconciliation after all of it. GitHub Actions runs them on every push.

## Run locally

Needs Node.js 20.6+ and a MongoDB **replica set** for transactions. A free MongoDB Atlas cluster works; a single local `mongod` does not.

```bash
# API
cd server
cp .env.example .env    # set MONGODB_URI and JWT_SECRET
npm install
npm run dev             # http://localhost:5000

# Web app (new terminal)
cd client
cp .env.example .env    # VITE_API_URL=http://localhost:5000
npm install
npm run dev             # http://localhost:5173
```

## Deploy

- **Database:** MongoDB Atlas (free M0). Allow network access from anywhere so Render can connect.
- **API:** Render web service, root directory `server`, build `npm install`, start `npm start`. Env: `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGINS` (the frontend URL), `NODE_VERSION=22`.
- **Web app:** Vercel, root directory `client`. Env: `VITE_API_URL` (the Render URL). `vercel.json` sends every path to `index.html` so routes work on refresh.

## Project structure

```
server/
  src/lib/          money (paise), limits, validation, errors
  src/models/       User, Account, Transaction, LedgerEntry, IdempotencyKey, PaymentRequest, DailyUsage
  src/services/     ledger (moveMoney), payments, pin, reconcile, db (transactions)
  src/middleware/   auth, idempotency, rate limits, errors
  src/routes/       auth, wallet, transfers, requests, transactions
  scripts/          reconcile.js
  tests/            unit and API tests
client/
  src/lib/api.ts    fetch wrapper, idempotency keys, automatic safe retries
  src/pages/        Home, Send, Request, Requests, Add money, History, Settings
  src/components/   PIN sheet, receipt, activity list, layout
```

PayLite is a demo. No real money moves, and "Add money" is simulated.
