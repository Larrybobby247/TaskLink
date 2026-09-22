import mongoose from 'mongoose';
const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['USER', 'TASK', 'MESSAGE', 'REVIEW', 'APPLICATION'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true },
    description: { type: String, maxlength: 2000 },
    evidence: [{ url: String, publicId: String }],
    status: { type: String, enum: ['PENDING', 'REVIEWED', 'ACTIONED', 'DISMISSED'], default: 'PENDING', index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    adminNote: String,
  },
  { timestamps: true }
);

export const Report = mongoose.model('Report', reportSchema);
