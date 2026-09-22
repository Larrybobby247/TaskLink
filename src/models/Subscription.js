import mongoose from 'mongoose';
const { Schema } = mongoose;

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING'];

const subscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: String, enum: ['PRO'], default: 'PRO' },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'PENDING', index: true },
    priceKobo: { type: Number, required: true },
    startDate: { type: Date },
    endDate: { type: Date },
    paymentReference: { type: String, required: true },
    autoRenew: { type: Boolean, default: false },
  },
  { timestamps: true }
);

subscriptionSchema.index({ user: 1, status: 1 });

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
