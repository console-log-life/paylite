import { Account } from '../models/Account.js';
import { notFound } from '../lib/errors.js';

export const SYSTEM_BANK = 'SYSTEM_BANK';

// Creates the system "bank" account once. Safe to call on every start-up:
// the upsert does nothing if it already exists.
export async function ensureSystemAccounts() {
  await Account.updateOne(
    { kind: 'system', code: SYSTEM_BANK },
    { $setOnInsert: { kind: 'system', code: SYSTEM_BANK, balancePaise: 0 } },
    { upsert: true },
  );
}

export async function getSystemBank(session) {
  const account = await Account.findOne({ kind: 'system', code: SYSTEM_BANK }).session(session ?? null);
  if (!account) throw new Error('System bank account is missing; ensureSystemAccounts() was not run');
  return account;
}

export async function getUserAccount(userId, session) {
  const account = await Account.findOne({ kind: 'user', userId }).session(session ?? null);
  if (!account) throw notFound('Wallet not found');
  return account;
}
