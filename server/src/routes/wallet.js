import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { idempotent } from '../middleware/idempotency.js';
import { readAmount } from '../lib/validate.js';
import { LIMITS, istDayKey } from '../lib/limits.js';
import { DailyUsage } from '../models/DailyUsage.js';
import { getUserAccount } from '../services/accounts.js';
import { topup } from '../services/payments.js';
import { verifyAccount } from '../services/reconcile.js';

const router = Router();

// GET /api/wallet -> balance and how much can still be sent today
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const account = await getUserAccount(req.userId);
    const usage = await DailyUsage.findOne({ accountId: account._id, day: istDayKey() });
    const sentToday = usage?.sentPaise ?? 0;
    res.json({
      balancePaise: account.balancePaise,
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

// POST /api/wallet/topup { amount }   (needs Idempotency-Key)
router.post(
  '/topup',
  idempotent(),
  asyncHandler(async (req, res) => {
    const amountPaise = readAmount(req.body?.amount);
    const result = await topup({ userId: req.userId, amountPaise, idempotency: req.idempotency });
    res.status(201).json(result);
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
