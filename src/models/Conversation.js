
import mongoose from 'mongoose';

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],

    // Existing conversation relationships
    task: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
    },

    order: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
    },

    application: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
    },

    // Gig marketplace: contact a worker before creating an application.
    gig: {
      type: Schema.Types.ObjectId,
      ref: 'Gig',
    },

    // Latest message preview and activity timestamp
    lastMessage: {
      type: String,
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // Conversation blocking
    isBlocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Efficiently retrieve a user's conversations, ordered by recent activity.
conversationSchema.index({
  participants: 1,
  updatedAt: -1,
});

// Keep the existing one-conversation-per-application constraint.
conversationSchema.index(
  { application: 1 },
  { unique: true, sparse: true }
);

// Support lookups for gig-related conversations.
// Deliberately not unique: participants can appear in multiple conversations.
conversationSchema.index({
  gig: 1,
  participants: 1,
});

export const Conversation = mongoose.model(
  'Conversation',
  conversationSchema
);
