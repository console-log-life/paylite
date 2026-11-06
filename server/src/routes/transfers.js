import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { idempotent } from '../middleware/idempotency.js';
import { lookupLimiter } from '../middleware/rateLimit.js';
import { readAmount, readHandle, readNote, readPin } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { User } from '../models/User.js';
import { transfer } from '../services/payments.js';

const router = Router();

// GET /api/transfers/lookup?to=ravi@paylite
// Shows the payee's name before paying, like UPI apps do, so a typo in the
// ID does not send money to a stranger.
router.get(
  '/lookup',
  lookupLimiter,
  asyncHandler(async (req, res) => {
    const handle = readHandle(req.query.to);
    const user = await User.findOne({ handle }, { name: 1, handle: 1 });
    if (!user) throw notFound('No PayLite user with this ID');
    res.json({ name: user.name, handle: user.handle, isSelf: user._id.equals(req.userId) });
  }),
);

// POST /api/transfers { to, amount, note, pin }   (needs Idempotency-Key)
router.post(
  '/',
  idempotent(),
  asyncHandler(async (req, res) => {
    const toHandle = readHandle(req.body?.to);
    const amountPaise = readAmount(req.body?.amount);
    const note = readNote(req.body?.note);
    const pin = readPin(req.body?.pin);
    const result = await transfer({
      userId: req.userId,
      toHandle,
      amountPaise,
      note,
      pin,
      idempotency: req.idempotency,
    });
    res.status(201).json(result);
  }),
);

export default router;
