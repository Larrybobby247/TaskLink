import mongoose from 'mongoose';
const { Schema } = mongoose;

export const DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED_CLIENT', 'RESOLVED_WORKER', 'PARTIAL_RESOLUTION', 'CLOSED'];

const disputeSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    description: { type: String, required: true, maxlength: 3000 },
    evidence: [{ url: String, publicId: String }],
    status: { type: String, enum: DISPUTE_STATUSES, default: 'OPEN', index: true },
    adminNotes: [{ admin: { type: Schema.Types.ObjectId, ref: 'User' }, note: String, createdAt: { type: Date, default: Date.now } }],
    resolution: String,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true }
);

export const Dispute = mongoose.model('Dispute', disputeSchema);
