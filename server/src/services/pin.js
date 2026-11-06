import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { AppError } from '../lib/errors.js';
import { LIMITS } from '../lib/limits.js';

// Checks a user's transaction PIN.
// After 3 wrong attempts the PIN is locked for 15 minutes, so a 4-digit PIN
// (10,000 possibilities) cannot be guessed by trying them all.
export async function verifyPin(userId, pin) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in');
  if (!user.pinHash) throw new AppError(403, 'PIN_NOT_SET', 'Set your transaction PIN first');

  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    throw new AppError(423, 'PIN_LOCKED', 'Too many wrong PIN attempts. Try again later.', {
      lockedUntil: user.pinLockedUntil.toISOString(),
    });
  }

  const correct = await bcrypt.compare(pin, user.pinHash);
  if (correct) {
    if (user.pinFailedAttempts > 0 || user.pinLockedUntil) {
      await User.updateOne({ _id: userId }, { $set: { pinFailedAttempts: 0, pinLockedUntil: null } });
    }
    return;
  }

  // $inc is atomic, so parallel wrong guesses are all counted.
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { pinFailedAttempts: 1 } },
    { new: true },
  );

  if (updated.pinFailedAttempts >= LIMITS.maxPinAttempts) {
    const lockedUntil = new Date(Date.now() + LIMITS.pinLockMs);
    await User.updateOne({ _id: userId }, { $set: { pinFailedAttempts: 0, pinLockedUntil: lockedUntil } });
    throw new AppError(423, 'PIN_LOCKED', 'Too many wrong PIN attempts. Try again in 15 minutes.', {
      lockedUntil: lockedUntil.toISOString(),
    });
  }

  throw new AppError(403, 'WRONG_PIN', 'Incorrect PIN', {
    attemptsLeft: LIMITS.maxPinAttempts - updated.pinFailedAttempts,
  });
}

export async function setPin(userId, pin) {
  const pinHash = await bcrypt.hash(pin, 10);
  await User.updateOne({ _id: userId }, { $set: { pinHash, pinFailedAttempts: 0, pinLockedUntil: null } });
}
