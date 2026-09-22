import mongoose from 'mongoose';
const { Schema } = mongoose;

export const PAYMENT_STATUSES = ['INITIALIZED', 'PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'CANCELLED'];

const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    order: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    paystackReference: { type: String, required: true, unique: true },
    paystackAccessCode: String,
    amountKobo: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    platformFeeKobo: { type: Number, default: 0 },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'INITIALIZED', index: true },
    paymentType: { type: String, enum: ['ORDER_PAYMENT', 'SUBSCRIPTION', 'FEATURED_TASK'], required: true },
    metadata: { type: Schema.Types.Mixed },
    verifiedAt: Date,
    processedEventIds: [{ type: String }],
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
