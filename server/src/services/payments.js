import { User } from '../models/User.js';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { DailyUsage } from '../models/DailyUsage.js';
import { PaymentRequest } from '../models/PaymentRequest.js';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { AppError, notFound } from '../lib/errors.js';
import { LIMITS, istDayKey } from '../lib/limits.js';
import { paiseToRupees } from '../lib/money.js';
import { inTransaction } from './db.js';
import { moveMoney } from './ledger.js';
import { getSystemBank, getUserAccount } from './accounts.js';
import { verifyPin } from './pin.js';

// Saves the response for this request's Idempotency-Key in the SAME database
// transaction as the payment. So either the money moved and the response is
// stored, or neither happened. A retry can never pay a second time.
async function completeIdempotency(session, idempotency, status, body) {
  if (!idempotency) return;
  await IdempotencyKey.updateOne(
    { _id: idempotency._id },
    { $set: { state: 'completed', responseStatus: status, responseBody: body } },
    { session },
  );
}

function receipt(transaction, { balancePaise, counterparty, direction }) {
  return {
    transaction: {
      id: transaction._id.toString(),
      reference: transaction.reference,
      type: transaction.type,
      direction,
      amountPaise: transaction.amountPaise,
      note: transaction.note,
      createdAt: transaction.createdAt.toISOString(),
      counterparty,
    },
    balancePaise,
  };
}

// Checks done before any money moves. These read data but do not need to be
// inside the transaction; the limits that must be exact are re-checked inside.
async function preTransferChecks(userId, amountPaise, pin) {
  if (amountPaise > LIMITS.maxTransferPaise) {
    throw new AppError(422, 'LIMIT_PER_TRANSACTION', `The most you can send at once is ₹${paiseToRupees(LIMITS.maxTransferPaise)}`);
  }

  // Velocity limit: stops a stolen session from draining the wallet in a burst
  // of small payments. Counted from recent transactions this user started.
  const since = new Date(Date.now() - LIMITS.velocityWindowMs);
  const recent = await Transaction.countDocuments({
    initiatedBy: userId,
    type: { $in: ['transfer', 'request_payment'] },
    createdAt: { $gte: since },
  });
  if (recent >= LIMITS.velocityMaxTransfers) {
    throw new AppError(429, 'VELOCITY_LIMIT', 'Too many payments in a short time. Wait a minute and try again.');
  }

  await verifyPin(userId, pin);
}

// Adds `amountPaise` to today's total sent, inside the payment transaction.
// If that pushes the total over the daily limit, throwing here rolls the
// whole payment back.
async function addDailyUsage(session, accountId, amountPaise) {
  const day = istDayKey();
  // Create today's counter outside the transaction first, so two first
  // payments of the day do not both try to insert it.
  await DailyUsage.updateOne({ accountId, day }, { $setOnInsert: { sentPaise: 0 } }, { upsert: true });

  const usage = await DailyUsage.findOneAndUpdate(
    { accountId, day },
    { $inc: { sentPaise: amountPaise } },
    { new: true, session },
  );
  if (usage.sentPaise > LIMITS.dailySendPaise) {
    const left = LIMITS.dailySendPaise - (usage.sentPaise - amountPaise);
    throw new AppError(422, 'LIMIT_DAILY', `Daily limit reached. You can send ₹${paiseToRupees(Math.max(left, 0))} more today.`);
  }
}

export async function transfer({ userId, toHandle, amountPaise, note, pin, idempotency }) {
  const payee = await User.findOne({ handle: toHandle });
  if (!payee) throw notFound('No PayLite user with this ID');
  if (payee._id.equals(userId)) throw new AppError(400, 'SAME_ACCOUNT', 'You cannot send money to yourself');

  await preTransferChecks(userId, amountPaise, pin);

  const fromAccount = await getUserAccount(userId);
  const toAccount = await getUserAccount(payee._id);

  return inTransaction(async (session) => {
    await addDailyUsage(session, fromAccount._id, amountPaise);
    const result = await moveMoney(session, {
      type: 'transfer',
      fromAccountId: fromAccount._id,
      toAccountId: toAccount._id,
      amountPaise,
      note,
      initiatedBy: userId,
    });
    const body = receipt(result.transaction, {
      balancePaise: result.fromBalancePaise,
      counterparty: { name: payee.name, handle: payee.handle },
      direction: 'sent',
    });
    await completeIdempotency(session, idempotency, 201, body);
    return body;
  });
}

// "Add money": in a real app this happens after the bank or card network
// confirms the payment. Here it is simulated by moving money out of the
// SYSTEM_BANK account, which is allowed to go negative.
export async function topup({ userId, amountPaise, idempotency }) {
  if (amountPaise > LIMITS.maxTopupPaise) {
    throw new AppError(422, 'LIMIT_TOPUP', `The most you can add at once is ₹${paiseToRupees(LIMITS.maxTopupPaise)}`);
  }
  const bank = await getSystemBank();
  const account = await getUserAccount(userId);

  return inTransaction(async (session) => {
    const result = await moveMoney(session, {
      type: 'topup',
      fromAccountId: bank._id,
      toAccountId: account._id,
      amountPaise,
      note: 'Added from bank',
      initiatedBy: userId,
      allowNegative: true,
    });
    const body = receipt(result.transaction, {
      balancePaise: result.toBalancePaise,
      counterparty: { name: 'Bank account', handle: null },
      direction: 'received',
    });
    await completeIdempotency(session, idempotency, 201, body);
    return body;
  });
}

// Pays a pending collect request. Marking the request "paid" happens in the
// same transaction as the money movement, and only matches while the request
// is still pending, so a request can be paid at most once even if the payer
// taps "Pay" twice on two devices.
export async function payRequest({ userId, requestId, pin, idempotency }) {
  const request = await PaymentRequest.findOne({ _id: requestId, payerId: userId });
  if (!request) throw notFound('Payment request not found');
  if (request.status !== 'pending') {
    throw new AppError(409, 'REQUEST_NOT_PENDING', `This request is already ${request.status}`);
  }
  if (request.expiresAt <= new Date()) throw new AppError(409, 'REQUEST_EXPIRED', 'This request has expired');

  await preTransferChecks(userId, request.amountPaise, pin);

  const requester = await User.findById(request.requesterId);
  const fromAccount = await getUserAccount(userId);
  const toAccount = await getUserAccount(request.requesterId);

  return inTransaction(async (session) => {
    const claimed = await PaymentRequest.findOneAndUpdate(
      { _id: request._id, status: 'pending', expiresAt: { $gt: new Date() } },
      { $set: { status: 'paid' } },
      { new: true, session },
    );
    if (!claimed) throw new AppError(409, 'REQUEST_NOT_PENDING', 'This request is no longer pending');

    await addDailyUsage(session, fromAccount._id, request.amountPaise);
    const result = await moveMoney(session, {
      type: 'request_payment',
      fromAccountId: fromAccount._id,
      toAccountId: toAccount._id,
      amountPaise: request.amountPaise,
      note: request.note,
      initiatedBy: userId,
      paymentRequestId: request._id,
    });
    await PaymentRequest.updateOne({ _id: request._id }, { $set: { transactionId: result.transaction._id } }, { session });

    const body = receipt(result.transaction, {
      balancePaise: result.fromBalancePaise,
      counterparty: { name: requester.name, handle: requester.handle },
      direction: 'sent',
    });
    await completeIdempotency(session, idempotency, 201, body);
    return body;
  });
}

export async function getBalance(userId) {
  const account = await Account.findOne({ kind: 'user', userId });
  return account ? account.balancePaise : 0;
}
