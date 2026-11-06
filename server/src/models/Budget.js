import mongoose from 'mongoose';
import { EXPENSE_CATEGORIES } from '../lib/categories.js';

// A monthly spending limit for one category, e.g. Food & Dining ₹6,000 in
// 2026-11. One per user, category and month (unique index), so saving again
// updates it instead of creating a second one.
const budgetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    amountPaise: { type: Number, required: true, min: 1 },
  },
  { timestamps: true },
);

budgetSchema.index({ userId: 1, month: 1, category: 1 }, { unique: true });

export const Budget = mongoose.model('Budget', budgetSchema);
