import mongoose from 'mongoose';

// Double-entry bookkeeping: every transaction writes one entry per account it
// touches. Money leaving an account is a negative amount, money arriving is
// positive, and the entries of one transaction always add up to zero. Money is
// never created or destroyed, only moved.
//
// Entries are append-only. Nothing in the code updates or deletes them; a
// mistake would be fixed with a new, reversing transaction.
const ledgerEntrySchema = new mongoose.Schema(
  {
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    // Signed: negative = debit (money out), positive = credit (money in).
    amountPaise: {
      type: Number,
      required: true,
      validate: { validator: (v) => Number.isInteger(v) && v !== 0, message: 'amountPaise must be a non-zero integer' },
    },
    // The account's balance right after this entry, for statements.
    balanceAfterPaise: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// History is always "one account's entries, newest first".
ledgerEntrySchema.index({ accountId: 1, _id: -1 });
ledgerEntrySchema.index({ transactionId: 1 });

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
