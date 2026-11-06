import mongoose from 'mongoose';

// How much an account has sent on one day (IST). Updated inside the same
// database transaction as the transfer, so two transfers running at the same
// moment cannot both slip under the daily limit: MongoDB sees both writing
// this one document, lets one commit, and retries the other.
const dailyUsageSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  day: { type: String, required: true }, // "2026-11-06"
  sentPaise: { type: Number, default: 0 },
});

dailyUsageSchema.index({ accountId: 1, day: 1 }, { unique: true });

export const DailyUsage = mongoose.model('DailyUsage', dailyUsageSchema);
