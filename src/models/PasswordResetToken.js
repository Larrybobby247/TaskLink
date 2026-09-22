import mongoose from 'mongoose';
const { Schema } = mongoose;

const passwordResetTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true }
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
