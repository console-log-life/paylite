import mongoose from 'mongoose';

// Remembers the result of every money-moving request by its Idempotency-Key.
// If the phone loses network after the server moved the money, the app
// retries with the same key and gets the saved response back instead of
// paying twice. See middleware/idempotency.js.
const idempotencyKeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  // Hash of method + path + body. The same key with a different request is a
  // client bug, and is rejected rather than silently replayed.
  requestHash: { type: String, required: true },
  state: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
  responseStatus: { type: Number },
  responseBody: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

// One record per (user, key). The unique index is what makes two identical
// requests arriving at the same moment safe: only one insert can succeed.
idempotencyKeySchema.index({ userId: 1, key: 1 }, { unique: true });
// MongoDB deletes keys automatically after 24 hours.
idempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);
