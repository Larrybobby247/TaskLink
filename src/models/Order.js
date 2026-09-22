import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ORDER_STATUSES = [
  'AWAITING_PAYMENT', 'PAYMENT_SECURED', 'IN_PROGRESS', 'SUBMITTED',
  'REVISION_REQUESTED', 'COMPLETED', 'CANCELLED', 'DISPUTED',
];

const submissionSchema = new Schema(
  {
    message: String,
    attachments: [{ url: String, publicId: String, originalName: String }],
    submittedAt: { type: Date, default: Date.now },
    revisionNumber: { type: Number, default: 0 },
  },
  { _id: true }
);

const revisionRequestSchema = new Schema(
  { message: { type: String, required: true }, requestedAt: { type: Date, default: Date.now }, revisionNumber: { type: Number, required: true } },
  { _id: true }
);

const orderSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    application: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    client: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    worker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Frozen at creation time - never re-derived from Task afterward.
    agreedAmountKobo: { type: Number, required: true },
    commissionPercent: { type: Number, required: true },
    platformFeeKobo: { type: Number, required: true },
    workerNetAmountKobo: { type: Number, required: true },

    status: { type: String, enum: ORDER_STATUSES, default: 'AWAITING_PAYMENT', index: true },
    paymentStatus: { type: String, enum: ['UNPAID', 'PENDING', 'PAID', 'REFUNDED'], default: 'UNPAID' },

    deadline: { type: Date, required: true },
    startedAt: Date,
    submittedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancelReason: String,

    submissions: [submissionSchema],
    revisionRequests: [revisionRequestSchema],
    revisionCount: { type: Number, default: 0 },
    maxRevisions: { type: Number, default: 3 },

    disputeStatus: { type: String, enum: ['NONE', 'OPEN', 'UNDER_REVIEW', 'RESOLVED'], default: 'NONE' },
  },
  { timestamps: true }
);

orderSchema.index({ client: 1, status: 1 });
orderSchema.index({ worker: 1, status: 1 });

export const Order = mongoose.model('Order', orderSchema);
