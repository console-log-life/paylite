import mongoose from 'mongoose';

// One money movement, e.g. "Asha paid Ravi ₹250". The actual balance changes
// are the LedgerEntry documents that point to it.
const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['transfer', 'topup', 'request_payment'], required: true },
    status: { type: String, enum: ['completed'], default: 'completed' },
    fromAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    toAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    note: { type: String, default: '' },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    paymentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentRequest', default: null },
    // Human-friendly reference shown on receipts, like a UPI reference number.
    reference: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
