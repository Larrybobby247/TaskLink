import mongoose from 'mongoose';
const { Schema } = mongoose;

export const LEDGER_TYPES = ['TASK_EARNING', 'PLATFORM_FEE', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT', 'BONUS', 'SUBSCRIPTION_PAYMENT'];

// Append-only ledger. A user's balance is DERIVED from these entries, never stored
// as a directly-editable field. This is the single source of truth for /wallet.
const transactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: LEDGER_TYPES, required: true, index: true },
    amountKobo: { type: Number, required: true }, // positive = credit, negative = debit
    balanceAfterKobo: { type: Number, required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    withdrawal: { type: Schema.Types.ObjectId, ref: 'Withdrawal' },
    description: { type: String, required: true },
    reference: { type: String, required: true, unique: true },
    createdByAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
    adjustmentReason: String,
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });

export const Transaction = mongoose.model('Transaction', transactionSchema);
