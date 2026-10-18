import mongoose from 'mongoose';
const { Schema } = mongoose;

export const ORDER_STATUSES = [
  // Task-post flow: after the client selects a worker the worker must submit a
  // work plan (requirements + structure + optional milestones) and the client
  // must approve it before any payment is requested.
  'AWAITING_PLAN', 'PLAN_REVIEW',
  'AWAITING_PAYMENT', 'PAYMENT_SECURED', 'IN_PROGRESS', 'SUBMITTED',
  'REVISION_REQUESTED', 'COMPLETED', 'CANCELLED', 'DISPUTED',
];

export const MILESTONE_STATUSES = ['PENDING_PAYMENT', 'FUNDED', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED'];

// One payment instalment. The client funds milestones one at a time, in order;
// the worker is only paid for a milestone after the client approves its work.
const milestoneSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    amountKobo: { type: Number, required: true, min: 1 },
    // Frozen when the plan is submitted so that fees/net add up exactly to the order totals.
    platformFeeKobo: { type: Number, default: 0 },
    workerNetKobo: { type: Number, default: 0 },
    status: { type: String, enum: MILESTONE_STATUSES, default: 'PENDING_PAYMENT' },
    fundedAt: Date,
    submittedAt: Date,
    approvedAt: Date,
  },
  { _id: true }
);

// The worker's proposal for how the job will run. Reviewed and approved by the
// client before payment.
const planSchema = new Schema(
  {
    requirements: [{ type: String, trim: true, maxlength: 300 }],
    structure: { type: String, trim: true, maxlength: 3000 },
    useMilestones: { type: Boolean, default: false },
    milestones: [milestoneSchema],
    clientFeedback: { type: String, maxlength: 1000 },
    changeRequestCount: { type: Number, default: 0 },
    submittedAt: Date,
    acceptedAt: Date,
  },
  { _id: false }
);

const submissionSchema = new Schema(
  {
    milestone: { type: Schema.Types.ObjectId },
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
    paymentStatus: { type: String, enum: ['UNPAID', 'PENDING', 'PARTIAL', 'PAID', 'REFUNDED'], default: 'UNPAID' },

    deadline: { type: Date, required: true },
    startedAt: Date,
    submittedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancelReason: String,

    plan: planSchema,

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
