
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TASK_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'APPLICATIONS_OPEN',
  'WORKER_SELECTED',
  'PAYMENT_PENDING',
  'PAYMENT_SECURED',
  'IN_PROGRESS',
  'SUBMITTED',
  'REVISION_REQUESTED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
  'EXPIRED',
];

// Identifies how a task was created.
//
// TASK_POST: Normal client task posted for workers to apply.
// GIG_ORDER: Task created when a client orders a published gig.
// DIRECT_HIRE: Task created when a client directly hires a worker.
//
// Gig orders and direct hires use the existing Task, Application,
// payment, and order workflows rather than a separate contract system.
export const TASK_SOURCES = [
  'TASK_POST',
  'GIG_ORDER',
  'DIRECT_HIRE',
];

const attachmentSchema = new Schema(
  {
    url: String,
    publicId: String,
    resourceType: String,
    originalName: String,
  },
  { _id: false }
);

const taskSchema = new Schema(
  {
    // Client who owns the task.
    client: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Task information.
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },

    budgetType: {
      type: String,
      enum: ['FIXED', 'NEGOTIABLE'],
      default: 'FIXED',
    },

    budgetKobo: {
      type: Number,
      required: true,
      min: 0,
    },

    location: {
      type: String,
      trim: true,
    },

    isRemote: {
      type: Boolean,
      default: true,
    },

    deadline: {
      type: Date,
      required: true,
    },

    applicationDeadline: {
      type: Date,
    },

    workersRequired: {
      type: Number,
      default: 1,
      min: 1,
    },

    skillsRequired: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    attachments: [attachmentSchema],

    additionalInstructions: {
      type: String,
      maxlength: 2000,
    },

    // Task lifecycle.
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: 'DRAFT',
      index: true,
    },

    applicationCount: {
      type: Number,
      default: 0,
    },

    // Featured task functionality.
    isFeatured: {
      type: Boolean,
      default: false,
    },

    featuredUntil: {
      type: Date,
    },

    // Moderation.
    isFlagged: {
      type: Boolean,
      default: false,
    },

    flagReason: {
      type: String,
    },

    // Publication and expiration.
    publishedAt: {
      type: Date,
    },

    expiresAt: {
      type: Date,
    },

    // Gig marketplace: how this task originated.
    source: {
      type: String,
      enum: TASK_SOURCES,
      default: 'TASK_POST',
      index: true,
    },

    // Associated gig for gig orders.
    // Intended for source === 'GIG_ORDER'.
    gig: {
      type: Schema.Types.ObjectId,
      ref: 'Gig',
    },
  },
  {
    timestamps: true,
  }
);

// Query indexes.
taskSchema.index({
  category: 1,
  status: 1,
  createdAt: -1,
});

taskSchema.index({
  status: 1,
  deadline: 1,
});

taskSchema.index({
  location: 1,
});

taskSchema.index({
  budgetKobo: 1,
});

// Full-text search.
taskSchema.index({
  title: 'text',
  description: 'text',
});

export const Task = mongoose.model('Task', taskSchema);
