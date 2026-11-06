import { LedgerEntry } from '../models/LedgerEntry.js';
import { Account } from '../models/Account.js';
import { User } from '../models/User.js';
import { Budget } from '../models/Budget.js';
import { INCOME } from '../lib/categories.js';

export const WARNING_PERCENT = 80;
const TREND_MONTHS = 6;
const IST = 'Asia/Kolkata';

// "2026-11" -> start and end of that month in Indian time.
export function istMonthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { start: new Date(`${month}-01T00:00:00+05:30`), end: new Date(`${next}-01T00:00:00+05:30`) };
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function budgetStatus(budgetPaise, spentPaise) {
  const percentUsed = Math.round((spentPaise / budgetPaise) * 1000) / 10;
  let status = 'ok';
  if (spentPaise > budgetPaise) status = 'exceeded';
  else if (percentUsed >= WARNING_PERCENT) status = 'warning';
  return { spentPaise, remainingPaise: budgetPaise - spentPaise, percentUsed, status };
}

// The spending report for one month. Every payment the user made is already
// a ledger entry with a category, so the report is a few MongoDB aggregation
// pipelines over the ledger: nothing has to be entered twice.
//   spending  = the user's negative entries (money out)
//   income    = positive entries labelled "Income" (top-ups are the user's
//               own money moving in, so they are not counted as income)
export async function buildInsights(userId, accountId, month) {
  const { start, end } = istMonthRange(month);
  const trendStart = istMonthRange(shiftMonth(month, -(TREND_MONTHS - 1))).start;
  const inMonth = { accountId, createdAt: { $gte: start, $lt: end } };

  const [byCategoryRows, trendRows, topPayeeRows, budgets] = await Promise.all([
    LedgerEntry.aggregate([
      { $match: { ...inMonth, amountPaise: { $lt: 0 } } },
      { $group: { _id: { $ifNull: ['$category', 'Other'] }, totalPaise: { $sum: { $abs: '$amountPaise' } }, count: { $sum: 1 } } },
      { $sort: { totalPaise: -1 } },
    ]),

    LedgerEntry.aggregate([
      {
        $match: {
          accountId,
          createdAt: { $gte: trendStart, $lt: end },
          $or: [{ amountPaise: { $lt: 0 } }, { category: INCOME }],
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: IST } },
          spentPaise: { $sum: { $cond: [{ $lt: ['$amountPaise', 0] }, { $abs: '$amountPaise' }, 0] } },
          receivedPaise: { $sum: { $cond: [{ $gt: ['$amountPaise', 0] }, '$amountPaise', 0] } },
        },
      },
    ]),

    LedgerEntry.aggregate([
      { $match: { ...inMonth, amountPaise: { $lt: 0 } } },
      { $group: { _id: '$counterpartyAccountId', totalPaise: { $sum: { $abs: '$amountPaise' } }, count: { $sum: 1 } } },
      { $sort: { totalPaise: -1 } },
      { $limit: 5 },
    ]),

    Budget.find({ userId, month }).sort({ category: 1 }),
  ]);

  const byCategory = byCategoryRows.map((r) => ({ category: r._id, totalPaise: r.totalPaise, count: r.count }));
  const spentByCategory = new Map(byCategory.map((c) => [c.category, c.totalPaise]));
  const spentPaise = byCategory.reduce((sum, c) => sum + c.totalPaise, 0);

  // Fill months with no payments so the chart has no gaps.
  const trendByMonth = new Map(trendRows.map((r) => [r._id, r]));
  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
    const m = shiftMonth(month, i - (TREND_MONTHS - 1));
    const row = trendByMonth.get(m);
    return { month: m, spentPaise: row?.spentPaise ?? 0, receivedPaise: row?.receivedPaise ?? 0 };
  });

  const accounts = await Account.find({ _id: { $in: topPayeeRows.map((r) => r._id) } }, { userId: 1 });
  const users = await User.find({ _id: { $in: accounts.map((a) => a.userId) } }, { name: 1, handle: 1 });
  const userByAccount = new Map(
    accounts.map((a) => [a._id.toString(), users.find((u) => a.userId && u._id.equals(a.userId))]),
  );
  const topPayees = topPayeeRows.map((r) => {
    const u = userByAccount.get(r._id.toString());
    return { name: u?.name ?? 'Unknown', handle: u?.handle ?? null, totalPaise: r.totalPaise, count: r.count };
  });

  const budgetItems = budgets.map((b) => ({
    id: b._id.toString(),
    category: b.category,
    month: b.month,
    amountPaise: b.amountPaise,
    ...budgetStatus(b.amountPaise, spentByCategory.get(b.category) || 0),
  }));

  const previous = trend[trend.length - 2];
  const current = trend[trend.length - 1];

  return {
    month,
    spentPaise,
    receivedPaise: current.receivedPaise,
    spentChangePercent:
      previous.spentPaise > 0 ? Math.round(((current.spentPaise - previous.spentPaise) / previous.spentPaise) * 1000) / 10 : null,
    byCategory,
    trend,
    topPayees,
    budgets: budgetItems,
    alerts: budgetItems.filter((b) => b.status !== 'ok').sort((a, b) => b.percentUsed - a.percentUsed),
  };
}
