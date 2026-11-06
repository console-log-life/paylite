import mongoose from 'mongoose';

// A place money can sit. Every user has one wallet account. There is also
// one system account, SYSTEM_BANK, which stands for "the outside world":
// money added to PayLite comes out of it, so its balance goes negative by
// exactly the amount users have added. That keeps the sum of all balances at
// zero, which is what makes the ledger checkable (see services/reconcile.js).
const accountSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['user', 'system'], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    code: { type: String, default: null }, // e.g. "SYSTEM_BANK" for system accounts
    // Cached balance. The source of truth is the ledger; this copy exists so
    // a balance check is one document read instead of summing every entry.
    // It is only ever changed in the same database transaction that writes
    // the matching ledger entries.
    balancePaise: {
      type: Number,
      required: true,
      default: 0,
      validate: { validator: Number.isInteger, message: 'balancePaise must be an integer' },
    },
  },
  { timestamps: true },
);

accountSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { kind: 'user' } });
accountSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { kind: 'system' } });

export const Account = mongoose.model('Account', accountSchema);
