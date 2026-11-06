import { Account } from '../models/Account.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Transaction } from '../models/Transaction.js';

// Checks that one account's cached balance equals the sum of its ledger
// entries. If they ever differ, something wrote a balance without a ledger
// entry (or the other way round), which this design should make impossible.
export async function verifyAccount(accountId) {
  const account = await Account.findById(accountId);
  const [row] = await LedgerEntry.aggregate([
    { $match: { accountId } },
    { $group: { _id: null, total: { $sum: '$amountPaise' }, entries: { $sum: 1 } } },
  ]);
  const ledgerBalancePaise = row?.total ?? 0;
  return {
    cachedBalancePaise: account.balancePaise,
    ledgerBalancePaise,
    entries: row?.entries ?? 0,
    matches: account.balancePaise === ledgerBalancePaise,
  };
}

// Checks the whole system:
//  1. every transaction's entries add up to zero (money moved, not created),
//  2. all ledger entries together add up to zero,
//  3. every account's cached balance equals its ledger sum.
export async function reconcileAll() {
  const unbalanced = await LedgerEntry.aggregate([
    { $group: { _id: '$transactionId', total: { $sum: '$amountPaise' }, entries: { $sum: 1 } } },
    { $match: { $or: [{ total: { $ne: 0 } }, { entries: { $ne: 2 } }] } },
    { $limit: 20 },
  ]);

  const [grand] = await LedgerEntry.aggregate([{ $group: { _id: null, total: { $sum: '$amountPaise' } } }]);

  const perAccount = await LedgerEntry.aggregate([{ $group: { _id: '$accountId', total: { $sum: '$amountPaise' } } }]);
  const ledgerByAccount = new Map(perAccount.map((r) => [r._id.toString(), r.total]));
  const accounts = await Account.find({}, { balancePaise: 1 });
  const mismatched = accounts
    .filter((a) => a.balancePaise !== (ledgerByAccount.get(a._id.toString()) ?? 0))
    .map((a) => ({
      accountId: a._id.toString(),
      cachedBalancePaise: a.balancePaise,
      ledgerBalancePaise: ledgerByAccount.get(a._id.toString()) ?? 0,
    }));

  const transactionsWithoutEntries = await Transaction.aggregate([
    { $lookup: { from: 'ledgerentries', localField: '_id', foreignField: 'transactionId', as: 'entries' } },
    { $match: { entries: { $size: 0 } } },
    { $count: 'n' },
  ]);

  const ok =
    unbalanced.length === 0 &&
    (grand?.total ?? 0) === 0 &&
    mismatched.length === 0 &&
    (transactionsWithoutEntries[0]?.n ?? 0) === 0;

  return {
    ok,
    ledgerTotalPaise: grand?.total ?? 0,
    unbalancedTransactions: unbalanced.map((u) => u._id.toString()),
    mismatchedAccounts: mismatched,
    transactionsWithoutEntries: transactionsWithoutEntries[0]?.n ?? 0,
    accountsChecked: accounts.length,
  };
}
