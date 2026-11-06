import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errors.js';
import { badRequest } from '../lib/errors.js';
import { paiseToRupees } from '../lib/money.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Transaction } from '../models/Transaction.js';
import { Account } from '../models/Account.js';
import { User } from '../models/User.js';
import { getUserAccount } from '../services/accounts.js';

const router = Router();

// Turns this account's ledger entries into readable history rows: who the
// money went to or came from, which way, and the balance after.
async function toHistory(entries, myAccountId) {
  const transactions = await Transaction.find({ _id: { $in: entries.map((e) => e.transactionId) } });
  const txById = new Map(transactions.map((t) => [t._id.toString(), t]));

  const otherAccountIds = transactions.map((t) => (t.fromAccountId.equals(myAccountId) ? t.toAccountId : t.fromAccountId));
  const accounts = await Account.find({ _id: { $in: otherAccountIds } });
  const users = await User.find({ _id: { $in: accounts.map((a) => a.userId).filter(Boolean) } }, { name: 1, handle: 1 });
  const userById = new Map(users.map((u) => [u._id.toString(), u]));
  const ownerByAccount = new Map(accounts.map((a) => [a._id.toString(), a.userId ? userById.get(a.userId.toString()) : null]));

  return entries.map((e) => {
    const t = txById.get(e.transactionId.toString());
    const otherId = t.fromAccountId.equals(myAccountId) ? t.toAccountId : t.fromAccountId;
    const other = ownerByAccount.get(otherId.toString());
    return {
      id: e._id.toString(),
      transactionId: t._id.toString(),
      reference: t.reference,
      type: t.type,
      direction: e.amountPaise < 0 ? 'sent' : 'received',
      amountPaise: Math.abs(e.amountPaise),
      balanceAfterPaise: e.balanceAfterPaise,
      note: t.note,
      createdAt: e.createdAt.toISOString(),
      counterparty: other ? { name: other.name, handle: other.handle } : { name: 'Bank account', handle: null },
    };
  });
}

function directionFilter(direction) {
  if (direction === 'sent') return { amountPaise: { $lt: 0 } };
  if (direction === 'received') return { amountPaise: { $gt: 0 } };
  return {};
}

// GET /api/transactions?limit=20&cursor=<id>&direction=sent|received
//
// Cursor pagination: the client sends the id of the last row it has, and the
// server returns rows older than that. Unlike page numbers (skip), this is
// fast on large histories and never shows a row twice when a new payment
// arrives while the user is scrolling.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const account = await getUserAccount(req.userId);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = { accountId: account._id, ...directionFilter(req.query.direction) };

    if (req.query.cursor) {
      if (!mongoose.isValidObjectId(req.query.cursor)) throw badRequest('Invalid cursor');
      filter._id = { $lt: new mongoose.Types.ObjectId(req.query.cursor) };
    }

    // Fetch one extra row to know whether another page exists.
    const entries = await LedgerEntry.find(filter).sort({ _id: -1 }).limit(limit + 1);
    const hasMore = entries.length > limit;
    const page = entries.slice(0, limit);

    res.json({
      items: await toHistory(page, account._id),
      nextCursor: hasMore ? page[page.length - 1]._id.toString() : null,
    });
  }),
);

function csvCell(value) {
  const text = String(value ?? '');
  // Quote cells with commas/quotes, and neutralise leading = + - @ so a
  // spreadsheet never runs a note as a formula (CSV injection).
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// GET /api/transactions/statement?from=2026-11-01&to=2026-11-30  -> CSV file
router.get(
  '/statement',
  asyncHandler(async (req, res) => {
    const dayRe = /^\d{4}-\d{2}-\d{2}$/;
    const { from, to } = req.query;
    if (!dayRe.test(from || '') || !dayRe.test(to || '')) throw badRequest('from and to must be YYYY-MM-DD');

    // Dates are taken as Indian days: 00:00 IST on `from` to 24:00 IST on `to`.
    const start = new Date(`${from}T00:00:00+05:30`);
    const end = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      throw badRequest('Invalid date range');
    }
    if (end - start > 366 * 24 * 60 * 60 * 1000) throw badRequest('Statement range can be at most one year');

    const account = await getUserAccount(req.userId);
    const entries = await LedgerEntry.find({ accountId: account._id, createdAt: { $gte: start, $lt: end } }).sort({ _id: 1 });
    const rows = await toHistory(entries, account._id);

    const header = ['Date (IST)', 'Reference', 'Type', 'Counterparty', 'PayLite ID', 'Note', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const when = new Date(r.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      lines.push(
        [
          when,
          r.reference,
          r.type,
          r.counterparty.name,
          r.counterparty.handle ?? '',
          r.note,
          r.direction === 'sent' ? paiseToRupees(r.amountPaise) : '',
          r.direction === 'received' ? paiseToRupees(r.amountPaise) : '',
          paiseToRupees(r.balanceAfterPaise),
        ]
          .map(csvCell)
          .join(','),
      );
    }

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="paylite-statement-${from}-to-${to}.csv"`);
    res.send(`${lines.join('\n')}\n`);
  }),
);

export default router;
