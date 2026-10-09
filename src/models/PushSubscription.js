import mongoose from 'mongoose';
const { Schema } = mongoose;

// One document per browser/device a user has enabled notifications on - a
// user can have several (phone + laptop, etc). `endpoint` is unique because
// it's how the push service (FCM/APNs/Mozilla push/etc, abstracted behind
// the Web Push protocol) identifies that specific subscription.
const pushSubscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: String,
  },
  { timestamps: true }
);

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
