import crypto from 'node:crypto';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { AppError } from '../lib/errors.js';

// Short reference shown on receipts, e.g. "PL7K2M9QX4TB".
export function newReference() {
  return `PL${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

// Moves money between two accounts. MUST be called inside a MongoDB
// transaction (`session`): the debit, the credit, the transaction record and
// both ledger entries are saved together or not at all.
//
// Overdraft protection is the debit itself: the update only matches if the
// balance is at least the amount. If two payments race, MongoDB lets one
// transaction write the account and makes the other retry, and the retry sees
// the new, lower balance. There is no "read balance, then write" gap.
export async function moveMoney(session, {
  type,
  fromAccountId,
  toAccountId,
  amountPaise,
  note = '',
  initiatedBy,
  paymentRequestId = null,
  allowNegative = false, // only for the system bank account
  fromCategory = null, // label for the payer's entry, e.g. "Food & Dining"
  toCategory = null, // label for the payee's entry, e.g. "Income"
}) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('moveMoney needs a positive integer amount');
  }
  if (fromAccountId.equals(toAccountId)) {
    throw new AppError(400, 'SAME_ACCOUNT', 'You cannot send money to yourself');
  }

  const debitFilter = allowNegative
    ? { _id: fromAccountId }
    : { _id: fromAccountId, balancePaise: { $gte: amountPaise } };

  const from = await Account.findOneAndUpdate(
    debitFilter,
    { $inc: { balancePaise: -amountPaise } },
    { new: true, session },
  );
  if (!from) {
    throw new AppError(422, 'INSUFFICIENT_FUNDS', 'Not enough balance for this payment');
  }

  const to = await Account.findOneAndUpdate(
    { _id: toAccountId },
    { $inc: { balancePaise: amountPaise } },
    { new: true, session },
  );
  if (!to) throw new Error(`Account ${toAccountId} does not exist`);

  const [transaction] = await Transaction.create(
    [{ type, fromAccountId, toAccountId, amountPaise, note, initiatedBy, paymentRequestId, reference: newReference() }],
    { session },
  );

  // The two entries add up to zero: -amount + amount.
  await LedgerEntry.insertMany(
    [
      {
        transactionId: transaction._id,
        accountId: fromAccountId,
        amountPaise: -amountPaise,
        balanceAfterPaise: from.balancePaise,
        counterpartyAccountId: toAccountId,
        category: fromCategory,
      },
      {
        transactionId: transaction._id,
        accountId: toAccountId,
        amountPaise,
        balanceAfterPaise: to.balancePaise,
        counterpartyAccountId: fromAccountId,
        category: toCategory,
      },
    ],
    { session },
  );

  return { transaction, fromBalancePaise: from.balancePaise, toBalancePaise: to.balancePaise };
}
