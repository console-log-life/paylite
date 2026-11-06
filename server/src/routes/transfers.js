import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { idempotent } from '../middleware/idempotency.js';
import { lookupLimiter } from '../middleware/rateLimit.js';
import { readAmount, readHandle, readNote, readPin } from '../lib/validate.js';
import { notFound } from '../lib/errors.js';
import { User } from '../models/User.js';
import { transfer } from '../services/payments.js';
import { getUserAccount } from '../services/accounts.js';
import { suggestCategory } from '../services/categorize.js';

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

// GET /api/transfers/suggest-category?to=ravi@paylite&note=swiggy
// Pre-fills the category on the send screen (see services/categorize.js).
router.get(
  '/suggest-category',
  asyncHandler(async (req, res) => {
    const account = await getUserAccount(req.userId);
    let payeeAccountId = null;
    if (req.query.to) {
      const payee = await User.findOne({ handle: readHandle(req.query.to) }, { _id: 1 });
      if (payee) payeeAccountId = (await getUserAccount(payee._id))._id;
    }
    res.json(await suggestCategory({ accountId: account._id, payeeAccountId, note: String(req.query.note || '') }));
  }),
);

// POST /api/transfers { to, amount, note, pin, category? }   (needs Idempotency-Key)
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
      category: req.body?.category,
      idempotency: req.idempotency,
    });
    res.status(201).json(result);
  }),
);

export default router;
