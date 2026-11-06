import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { DailyUsage } from '../models/DailyUsage.js';
import { PaymentRequest } from '../models/PaymentRequest.js';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { TopupOrder } from '../models/TopupOrder.js';
import { AppError, notFound } from '../lib/errors.js';
import { LIMITS, istDayKey } from '../lib/limits.js';
import { paiseToRupees } from '../lib/money.js';
import { inTransaction } from './db.js';
import { moveMoney } from './ledger.js';
import { getSystemBank, getUserAccount } from './accounts.js';
import { verifyPin } from './pin.js';
import { resolveCategory } from './categorize.js';
import { INCOME, TOPUP } from '../lib/categories.js';

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

function receipt(transaction, { balancePaise, counterparty, direction, category }) {
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
      category: category ?? null,
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

export async function transfer({ userId, toHandle, amountPaise, note, pin, category, idempotency }) {
  const payee = await User.findOne({ handle: toHandle });
  if (!payee) throw notFound('No PayLite user with this ID');
  if (payee._id.equals(userId)) throw new AppError(400, 'SAME_ACCOUNT', 'You cannot send money to yourself');

  await preTransferChecks(userId, amountPaise, pin);

  const fromAccount = await getUserAccount(userId);
  const toAccount = await getUserAccount(payee._id);
  const fromCategory = await resolveCategory({
    chosen: category,
    accountId: fromAccount._id,
    payeeAccountId: toAccount._id,
    note,
  });

  return inTransaction(async (session) => {
    await addDailyUsage(session, fromAccount._id, amountPaise);
    const result = await moveMoney(session, {
      type: 'transfer',
      fromAccountId: fromAccount._id,
      toAccountId: toAccount._id,
      amountPaise,
      note,
      initiatedBy: userId,
      fromCategory,
      toCategory: INCOME,
    });
    const body = receipt(result.transaction, {
      balancePaise: result.fromBalancePaise,
      counterparty: { name: payee.name, handle: payee.handle },
      direction: 'sent',
      category: fromCategory,
    });
    await completeIdempotency(session, idempotency, 201, body);
    return body;
  });
}

export function checkTopupAmount(amountPaise) {
  if (amountPaise > LIMITS.maxTopupPaise) {
    throw new AppError(422, 'LIMIT_TOPUP', `The most you can add at once is ₹${paiseToRupees(LIMITS.maxTopupPaise)}`);
  }
}

// Moves money from SYSTEM_BANK (the outside world, allowed to go negative)
// into the user's wallet. Must run inside a transaction.
async function creditWallet(session, { userId, amountPaise, note }) {
  const bank = await getSystemBank(session);
  const account = await getUserAccount(userId, session);
  const result = await moveMoney(session, {
    type: 'topup',
    fromAccountId: bank._id,
    toAccountId: account._id,
    amountPaise,
    note,
    initiatedBy: userId,
    allowNegative: true,
    toCategory: TOPUP,
  });
  return receipt(result.transaction, {
    balancePaise: result.toBalancePaise,
    counterparty: { name: 'Bank account', handle: null },
    direction: 'received',
    category: TOPUP,
  });
}

// Demo "add money" with no payment gateway: the money appears immediately.
// Used when Razorpay is not configured (local development and tests).
export async function demoTopup({ userId, amountPaise, idempotency }) {
  checkTopupAmount(amountPaise);
  return inTransaction(async (session) => {
    const body = await creditWallet(session, { userId, amountPaise, note: 'Added from bank (demo)' });
    await completeIdempotency(session, idempotency, 201, body);
    return body;
  });
}

// Credits a Razorpay top-up once the payment is proven (checkout signature or
// webhook). Both can arrive for the same payment, possibly at the same time.
// The order is flipped from "created" to "paid" inside the same transaction
// as the credit, and only while it is still "created", so the wallet is
// credited exactly once no matter how many confirmations arrive.
export async function creditTopupOrder({ orderId, paymentId, amountPaise }) {
  return inTransaction(async (session) => {
    const order = await TopupOrder.findOneAndUpdate(
      { orderId, status: 'created' },
      { $set: { status: 'paid', paymentId } },
      { new: true, session },
    );

    if (!order) {
      // Already credited (or unknown): return the existing result.
      const existing = await TopupOrder.findOne({ orderId }).session(session);
      if (!existing) throw notFound('Top-up order not found');
      return { alreadyCredited: true, order: existing };
    }

    if (amountPaise !== undefined && amountPaise !== order.amountPaise) {
      // The gateway says a different amount was paid. Do not credit; throwing
      // rolls back the status change so it can be looked at.
      throw new AppError(409, 'AMOUNT_MISMATCH', 'Paid amount does not match the order');
    }

    const body = await creditWallet(session, {
      userId: order.userId,
      amountPaise: order.amountPaise,
      note: 'Added via Razorpay',
    });
    await TopupOrder.updateOne({ _id: order._id }, { $set: { transactionId: body.transaction.id } }, { session });
    return { alreadyCredited: false, order, receipt: body };
  });
}

// Pays a pending collect request. Marking the request "paid" happens in the
// same transaction as the money movement, and only matches while the request
// is still pending, so a request can be paid at most once even if the payer
// taps "Pay" twice on two devices.
export async function payRequest({ userId, requestId, pin, category, idempotency }) {
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
  const fromCategory = await resolveCategory({
    chosen: category,
    accountId: fromAccount._id,
    payeeAccountId: toAccount._id,
    note: request.note,
  });

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
      fromCategory,
      toCategory: INCOME,
    });
    await PaymentRequest.updateOne({ _id: request._id }, { $set: { transactionId: result.transaction._id } }, { session });

    const body = receipt(result.transaction, {
      balancePaise: result.fromBalancePaise,
      counterparty: { name: requester.name, handle: requester.handle },
      direction: 'sent',
      category: fromCategory,
    });
    await completeIdempotency(session, idempotency, 201, body);
    return body;
  });
}
