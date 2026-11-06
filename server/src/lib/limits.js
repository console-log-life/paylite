import { rupees } from './money.js';

// Risk limits, similar in spirit to UPI's per-transaction and daily caps.
// Kept in one place so they are easy to find and to explain.
export const LIMITS = {
  // Largest single transfer or payment.
  maxTransferPaise: rupees(50_000),
  // Total a user can send in one calendar day (IST).
  dailySendPaise: rupees(1_00_000),
  // Largest single "add money" top-up.
  maxTopupPaise: rupees(50_000),
  // Most transfers a user can start within `velocityWindowMs`.
  velocityMaxTransfers: 5,
  velocityWindowMs: 60 * 1000,
  // Wrong PIN attempts before the PIN is locked, and for how long.
  maxPinAttempts: 3,
  pinLockMs: 15 * 60 * 1000,
  // A payment request expires after this long.
  requestTtlMs: 7 * 24 * 60 * 60 * 1000,
};

// Day key in Indian time, e.g. "2026-11-06". The daily limit resets at
// midnight IST, not midnight UTC (which would be 5:30 am in India).
export function istDayKey(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}
