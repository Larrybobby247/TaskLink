import mongoose from 'mongoose';
const { Schema } = mongoose;

export const APPLICATION_STATUSES = ['PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'];

const applicationSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    worker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    message: { type: String, required: true, maxlength: 2000 },
    proposedAmountKobo: { type: Number },
    estimatedCompletionHours: { type: Number },
    portfolioItemId: { type: Schema.Types.ObjectId },
    attachment: { url: String, publicId: String },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'PENDING', index: true },
    withdrawnAt: Date,
    rejectedAt: Date,
    acceptedAt: Date,
  },
  { timestamps: true }
);

applicationSchema.index({ task: 1, worker: 1 }, { unique: true });
applicationSchema.index({ worker: 1, status: 1 });

export const Application = mongoose.model('Application', applicationSchema);
