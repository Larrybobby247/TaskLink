import mongoose from 'mongoose';
const { Schema } = mongoose;

export const NOTIFICATION_TYPES = [
  'NEW_APPLICATION', 'APPLICATION_ACCEPTED', 'APPLICATION_REJECTED', 'WORKER_SELECTED',
  'PAYMENT_RECEIVED', 'PAYMENT_FAILED', 'TASK_STARTED', 'WORK_SUBMITTED', 'REVISION_REQUESTED',
  'TASK_COMPLETED', 'NEW_MESSAGE', 'NEW_REVIEW', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_SUCCESSFUL',
  'WITHDRAWAL_FAILED', 'PRO_ACTIVATED', 'PRO_EXPIRING', 'SECURITY_ALERT', 'DISPUTE_UPDATE', 'PLATFORM_ANNOUNCEMENT',
];

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: {
      entityType: { type: String, enum: ['TASK', 'ORDER', 'APPLICATION', 'MESSAGE', 'WITHDRAWAL', 'DISPUTE', 'NONE'] },
      entityId: { type: Schema.Types.ObjectId },
    },
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
