import mongoose from 'mongoose';
const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 'SUPPORT' covers general help-desk messages from the Help & Support page
    // that aren't about a specific task/user/message/review/application.
    targetType: {
      type: String,
      enum: ['USER', 'TASK', 'MESSAGE', 'REVIEW', 'APPLICATION', 'SUPPORT'],
      required: true,
    },
    // Optional now - a SUPPORT report has no specific target.
    targetId: { type: Schema.Types.ObjectId },

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
