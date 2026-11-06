import mongoose from 'mongoose';

// One "add money" attempt through Razorpay. Created before the checkout
// opens; marked paid exactly once when the payment is confirmed.
const topupOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: String, required: true, unique: true }, // Razorpay order id, "order_..."
    amountPaise: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['created', 'paid'], default: 'created' },
    paymentId: { type: String, default: null }, // Razorpay payment id, "pay_..."
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true },
);

topupOrderSchema.index({ userId: 1, createdAt: -1 });

export const TopupOrder = mongoose.model('TopupOrder', topupOrderSchema);
