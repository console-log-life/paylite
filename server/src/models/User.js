import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    // Public payment address, like a UPI ID: "apeksha@paylite".
    handle: { type: String, required: true, unique: true, lowercase: true },
    // Transaction PIN (4-6 digits), stored only as a bcrypt hash.
    pinHash: { type: String, default: null },
    pinFailedAttempts: { type: Number, default: 0 },
    pinLockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    handle: this.handle,
    hasPin: Boolean(this.pinHash),
  };
};

export const User = mongoose.model('User', userSchema);
