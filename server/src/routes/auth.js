import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Account } from '../models/Account.js';
import { readCredentials, readPin } from '../lib/validate.js';
import { AppError } from '../lib/errors.js';
import { asyncHandler } from '../middleware/errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { inTransaction } from '../services/db.js';
import { setPin } from '../services/pin.js';

const router = Router();

// "Asha Verma" / asha.v@gmail.com -> "asha.v", then "asha.v1", "asha.v2"...
function baseHandle(email) {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return (local.length >= 3 ? local : `${local}user`).slice(0, 24);
}

async function freeHandle(email) {
  const base = baseHandle(email);
  for (let i = 0; i < 50; i++) {
    const handle = `${i === 0 ? base : `${base}${i}`}@paylite`;
    if (!(await User.exists({ handle }))) return handle;
  }
  throw new AppError(409, 'HANDLE_TAKEN', 'Could not create a PayLite ID, try another email');
}

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, name } = readCredentials(req.body, { requireName: true });
    if (await User.exists({ email })) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const handle = await freeHandle(email);

    // User and wallet are created together, so there is never a user without
    // a wallet.
    const user = await inTransaction(async (session) => {
      const [created] = await User.create([{ name, email, passwordHash, handle }], { session });
      await Account.create([{ kind: 'user', userId: created._id, balancePaise: 0 }], { session });
      return created;
    });

    res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const invalid = new AppError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');
    let creds;
    try {
      creds = readCredentials(req.body);
    } catch {
      throw invalid;
    }
    const user = await User.findOne({ email: creds.email });
    // Same error whether the email exists or not.
    if (!user || !(await bcrypt.compare(creds.password, user.passwordHash))) throw invalid;
    res.json({ token: signToken(user._id), user: user.toPublic() });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in');
    res.json({ user: user.toPublic() });
  }),
);

// Set or change the transaction PIN. Needs the account password, so someone
// who picks up an unlocked phone cannot quietly change the PIN.
router.put(
  '/pin',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const pin = readPin(req.body?.pin);
    const user = await User.findById(req.userId);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(403, 'BAD_CREDENTIALS', 'Incorrect password', { fields: { password: 'Incorrect password' } });
    }
    await setPin(user._id, pin);
    res.json({ ok: true });
  }),
);

export default router;
