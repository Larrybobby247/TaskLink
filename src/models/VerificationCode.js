import mongoose from 'mongoose';
const { Schema } = mongoose;

const verificationCodeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: ['EMAIL_VERIFICATION', 'PHONE_VERIFICATION'], default: 'EMAIL_VERIFICATION' },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    lastSentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const VerificationCode = mongoose.model('VerificationCode', verificationCodeSchema);
