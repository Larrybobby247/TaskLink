import mongoose from 'mongoose';
const { Schema } = mongoose;

const adminActionLogSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true },
    targetType: { type: String },
    targetId: { type: Schema.Types.ObjectId },
    details: { type: Schema.Types.Mixed },
    ipAddress: String,
  },
  { timestamps: true }
);

adminActionLogSchema.index({ createdAt: -1 });

export const AdminActionLog = mongoose.model('AdminActionLog', adminActionLogSchema);
