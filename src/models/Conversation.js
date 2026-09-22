import mongoose from 'mongoose';
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    application: { type: Schema.Types.ObjectId, ref: 'Application' },
    lastMessage: { type: String },
    lastMessageAt: { type: Date, default: Date.now },
    isBlocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });
conversationSchema.index({ application: 1 }, { unique: true, sparse: true });

export const Conversation = mongoose.model('Conversation', conversationSchema);
