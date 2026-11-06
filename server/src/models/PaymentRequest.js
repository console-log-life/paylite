import mongoose from 'mongoose';

// "Collect" request: the requester asks the payer for money. The payer can
// pay it (with their PIN) or decline it; the requester can cancel it.
const paymentRequestSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    note: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'paid', 'declined', 'cancelled'], default: 'pending' },
    expiresAt: { type: Date, required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true },
);

paymentRequestSchema.index({ payerId: 1, status: 1, createdAt: -1 });
paymentRequestSchema.index({ requesterId: 1, createdAt: -1 });

export const PaymentRequest = mongoose.model('PaymentRequest', paymentRequestSchema);
