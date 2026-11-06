import { Router } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middleware/errors.js';
import { badRequest, notFound } from '../lib/errors.js';
import { readAmount } from '../lib/validate.js';
import { EXPENSE_CATEGORIES, isExpenseCategory } from '../lib/categories.js';
import { Budget } from '../models/Budget.js';
import { getUserAccount } from '../services/accounts.js';
import { buildInsights } from '../services/insights.js';

const router = Router();
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentIstMonth() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function readMonth(value) {
  const month = value || currentIstMonth();
  if (!MONTH_RE.test(month)) throw badRequest('month must be YYYY-MM');
  return month;
}

// GET /api/insights/categories -> the list the app shows in dropdowns
router.get('/categories', (req, res) => res.json({ items: EXPENSE_CATEGORIES }));

// GET /api/insights?month=2026-11
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const month = readMonth(req.query.month);
    const account = await getUserAccount(req.userId);
    res.json(await buildInsights(req.userId, account._id, month));
  }),
);

// PUT /api/insights/budgets { category, month, amount }
// Atomic upsert on (user, month, category): saving twice updates one budget.
router.put(
  '/budgets',
  asyncHandler(async (req, res) => {
    const category = req.body?.category;
    if (!isExpenseCategory(category)) throw badRequest('Unknown category', { fields: { category: 'Choose a category' } });
    const month = readMonth(req.body?.month);
    const amountPaise = readAmount(req.body?.amount);

    const budget = await Budget.findOneAndUpdate(
      { userId: req.userId, month, category },
      { $set: { amountPaise } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    res.json({ budget: { id: budget._id.toString(), category, month, amountPaise } });
  }),
);

router.delete(
  '/budgets/:id',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Budget not found');
    const result = await Budget.deleteOne({ _id: req.params.id, userId: req.userId });
    if (result.deletedCount === 0) throw notFound('Budget not found');
    res.status(204).end();
  }),
);

export default router;
