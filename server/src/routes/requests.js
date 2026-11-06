import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errors.js';
import { idempotent } from '../middleware/idempotency.js';
import { readAmount, readHandle, readNote, readPin } from '../lib/validate.js';
import { AppError, notFound } from '../lib/errors.js';
import { LIMITS } from '../lib/limits.js';
import { User } from '../models/User.js';
import { PaymentRequest } from '../models/PaymentRequest.js';
import { payRequest } from '../services/payments.js';

const router = Router();

// A request past its expiry is shown as "expired" even though it is stored
// as "pending"; nothing needs to run on a timer to expire it.
function present(request, me, people) {
  const expired = request.status === 'pending' && request.expiresAt <= new Date();
  const incoming = request.payerId.equals(me);
  const other = people.get((incoming ? request.requesterId : request.payerId).toString());
  return {
    id: request._id.toString(),
    direction: incoming ? 'incoming' : 'outgoing',
    amountPaise: request.amountPaise,
    note: request.note,
    status: expired ? 'expired' : request.status,
    createdAt: request.createdAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    counterparty: other ? { name: other.name, handle: other.handle } : null,
  };
}

async function peopleFor(requests) {
  const ids = [...new Set(requests.flatMap((r) => [r.requesterId.toString(), r.payerId.toString()]))];
  const users = await User.find({ _id: { $in: ids } }, { name: 1, handle: 1 });
  return new Map(users.map((u) => [u._id.toString(), u]));
}

function checkId(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Payment request not found');
}

// GET /api/requests?box=incoming|outgoing
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = req.query.box === 'outgoing' ? { requesterId: req.userId } : { payerId: req.userId };
    const requests = await PaymentRequest.find(filter).sort({ createdAt: -1 }).limit(50);
    const people = await peopleFor(requests);
    res.json({ items: requests.map((r) => present(r, req.userId, people)) });
  }),
);

// POST /api/requests { from, amount, note }  -> ask `from` to pay you
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const payerHandle = readHandle(req.body?.from);
    const amountPaise = readAmount(req.body?.amount);
    const note = readNote(req.body?.note);
    if (amountPaise > LIMITS.maxTransferPaise) {
      throw new AppError(422, 'LIMIT_PER_TRANSACTION', 'Amount is above the per-payment limit');
    }

    const payer = await User.findOne({ handle: payerHandle });
    if (!payer) throw notFound('No PayLite user with this ID');
    if (payer._id.equals(req.userId)) throw new AppError(400, 'SAME_ACCOUNT', 'You cannot request money from yourself');

    // Limits spam: at most 10 open requests from one person to another.
    const open = await PaymentRequest.countDocuments({
      requesterId: req.userId,
      payerId: payer._id,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });
    if (open >= 10) throw new AppError(429, 'TOO_MANY_REQUESTS', 'You already have 10 open requests to this person');

    const request = await PaymentRequest.create({
      requesterId: req.userId,
      payerId: payer._id,
      amountPaise,
      note,
      expiresAt: new Date(Date.now() + LIMITS.requestTtlMs),
    });
    const people = await peopleFor([request]);
    res.status(201).json({ request: present(request, req.userId, people) });
  }),
);

// POST /api/requests/:id/pay { pin }   (needs Idempotency-Key)
router.post(
  '/:id/pay',
  idempotent(),
  asyncHandler(async (req, res) => {
    checkId(req.params.id);
    const pin = readPin(req.body?.pin);
    const result = await payRequest({
      userId: req.userId,
      requestId: req.params.id,
      pin,
      category: req.body?.category,
      idempotency: req.idempotency,
    });
    res.status(201).json(result);
  }),
);

// Decline (payer) or cancel (requester). Only a pending request can change,
// and the status check is part of the update, so it cannot race with "pay".
async function closeRequest(req, res, { who, status }) {
  checkId(req.params.id);
  const filter = { _id: req.params.id, status: 'pending', [who]: req.userId };
  const updated = await PaymentRequest.findOneAndUpdate(filter, { $set: { status } }, { new: true });
  if (!updated) {
    const exists = await PaymentRequest.exists({ _id: req.params.id, [who]: req.userId });
    if (!exists) throw notFound('Payment request not found');
    throw new AppError(409, 'REQUEST_NOT_PENDING', 'This request is no longer pending');
  }
  const people = await peopleFor([updated]);
  res.json({ request: present(updated, req.userId, people) });
}

router.post('/:id/decline', asyncHandler((req, res) => closeRequest(req, res, { who: 'payerId', status: 'declined' })));
router.post('/:id/cancel', asyncHandler((req, res) => closeRequest(req, res, { who: 'requesterId', status: 'cancelled' })));

export default router;
