import { LedgerEntry } from '../models/LedgerEntry.js';
import { categoryFromNote, isExpenseCategory } from '../lib/categories.js';

// Picks a spending category for a new payment, in this order:
//  1. a keyword in the note ("Swiggy order" -> Food & Dining),
//  2. whatever category the user chose the last time they paid this person
//     (so after you file your landlord under Rent once, it stays Rent),
//  3. "Other".
export async function suggestCategory({ accountId, payeeAccountId, note }) {
  const fromNote = categoryFromNote(note);
  if (fromNote) return { category: fromNote, source: 'note' };

  if (payeeAccountId) {
    const last = await LedgerEntry.findOne(
      { accountId, counterpartyAccountId: payeeAccountId, amountPaise: { $lt: 0 }, category: { $ne: null } },
      { category: 1 },
    ).sort({ _id: -1 });
    if (last && isExpenseCategory(last.category)) return { category: last.category, source: 'history' };
  }

  return { category: 'Other', source: 'default' };
}

// Uses the category the user picked if it is valid, otherwise suggests one.
export async function resolveCategory({ chosen, accountId, payeeAccountId, note }) {
  if (isExpenseCategory(chosen)) return chosen;
  return (await suggestCategory({ accountId, payeeAccountId, note })).category;
}
