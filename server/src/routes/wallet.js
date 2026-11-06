import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { idempotent } from '../middleware/idempotency.js';
import { readAmount } from '../lib/validate.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { LIMITS, istDayKey } from '../lib/limits.js';
import { config } from '../config.js';
import { DailyUsage } from '../models/DailyUsage.js';
import { TopupOrder } from '../models/TopupOrder.js';
import { User } from '../models/User.js';
import { Transaction } from '../models/Transaction.js';
import { getUserAccount } from '../services/accounts.js';
import { checkTopupAmount, creditTopupOrder, demoTopup } from '../services/payments.js';
import { verifyAccount } from '../services/reconcile.js';
import { createRazorpayOrder, razorpayEnabled, verifyCheckoutSignature } from '../services/razorpay.js';

const router = Router();

const demoAllowed = () => !razorpayEnabled() || config.allowDemoTopup;

// GET /api/wallet -> balance, limits and how "Add money" works
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const account = await getUserAccount(req.userId);
    const usage = await DailyUsage.findOne({ accountId: account._id, day: istDayKey() });
    const sentToday = usage?.sentPaise ?? 0;
    res.json({
      balancePaise: account.balancePaise,
      topupMode: razorpayEnabled() ? 'razorpay' : 'demo',
      limits: {
        maxTransferPaise: LIMITS.maxTransferPaise,
        dailySendPaise: LIMITS.dailySendPaise,
        sentTodayPaise: sentToday,
        remainingTodayPaise: Math.max(LIMITS.dailySendPaise - sentToday, 0),
        maxTopupPaise: LIMITS.maxTopupPaise,
      },
    });
  }),
);

// POST /api/wallet/topup { amount }   (demo mode only; needs Idempotency-Key)
router.post(
  '/topup',
  idempotent(),
  asyncHandler(async (req, res) => {
    if (!demoAllowed()) {
      throw new AppError(403, 'DEMO_TOPUP_DISABLED', 'Add money through Razorpay checkout');
    }
    const amountPaise = readAmount(req.body?.amount);
    const result = await demoTopup({ userId: req.userId, amountPaise, idempotency: req.idempotency });
    res.status(201).json(result);
  }),
);

// Step 1 of a Razorpay top-up: create the order on the server.
// POST /api/wallet/topup/order { amount } -> { orderId, amountPaise, keyId, ... }
router.post(
  '/topup/order',
  asyncHandler(async (req, res) => {
    if (!razorpayEnabled()) throw new AppError(400, 'RAZORPAY_OFF', 'Razorpay is not configured');
    const amountPaise = readAmount(req.body?.amount);
    checkTopupAmount(amountPaise);

    const user = await User.findById(req.userId);
    const order = await createRazorpayOrder({
      amountPaise,
      receipt: `topup_${req.userId}_${Date.now()}`.slice(0, 40),
      notes: { userId: req.userId.toString(), purpose: 'wallet_topup' },
    });
    await TopupOrder.create({ userId: req.userId, orderId: order.id, amountPaise });

    res.status(201).json({
      orderId: order.id,
      amountPaise,
      currency: 'INR',
      keyId: config.razorpayKeyId, // the key id is public; the secret never leaves the server
      prefill: { name: user.name, email: user.email },
    });
  }),
);

// Step 2: the browser sends back what Razorpay checkout returned.
// POST /api/wallet/topup/verify { orderId, paymentId, signature }
router.post(
  '/topup/verify',
  asyncHandler(async (req, res) => {
    if (!razorpayEnabled()) throw new AppError(400, 'RAZORPAY_OFF', 'Razorpay is not configured');
    const { orderId, paymentId, signature } = req.body || {};
    if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
      throw badRequest('orderId, paymentId and signature are required');
    }

    const order = await TopupOrder.findOne({ orderId, userId: req.userId });
    if (!order) throw notFound('Top-up order not found');

    if (!verifyCheckoutSignature({ orderId, paymentId, signature })) {
      throw new AppError(400, 'BAD_SIGNATURE', 'Payment could not be verified');
    }

    const result = await creditTopupOrder({ orderId, paymentId });
    if (result.receipt) return res.status(201).json(result.receipt);

    // The webhook got here first; return the same receipt it produced.
    const tx = await Transaction.findById(result.order.transactionId);
    const account = await getUserAccount(req.userId);
    return res.json({
      transaction: {
        id: tx._id.toString(),
        reference: tx.reference,
        type: tx.type,
        direction: 'received',
        amountPaise: tx.amountPaise,
        note: tx.note,
        createdAt: tx.createdAt.toISOString(),
        counterparty: { name: 'Bank account', handle: null },
        category: 'Wallet top-up',
      },
      balancePaise: account.balancePaise,
    });
  }),
);

// GET /api/wallet/verify -> proves the balance equals the sum of the ledger
router.get(
  '/verify',
  asyncHandler(async (req, res) => {
    const account = await getUserAccount(req.userId);
    res.json(await verifyAccount(account._id));
  }),
);

export default router;
