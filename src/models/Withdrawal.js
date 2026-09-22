import mongoose from 'mongoose';
const { Schema } = mongoose;

export const WITHDRAWAL_STATUSES = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED'];

const withdrawalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountKobo: { type: Number, required: true, min: 0 },
    feeKobo: { type: Number, default: 0 },
    netAmountKobo: { type: Number, required: true },
    bankName: { type: String, required: true },
    bankCode: { type: String, required: true },
    accountNumberLast4: { type: String, required: true },
    accountName: { type: String, required: true },
    paystackRecipientCode: String,
    status: { type: String, enum: WITHDRAWAL_STATUSES, default: 'PENDING', index: true },
    reference: { type: String, required: true, unique: true },
    paystackTransferCode: String,
    failureReason: String,
    requestedAt: { type: Date, default: Date.now },
    processedAt: Date,
  },
  { timestamps: true }
);

export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
