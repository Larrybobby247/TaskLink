import mongoose from 'mongoose';
const { Schema } = mongoose;

const savedTaskSchema = new Schema(
  { user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, task: { type: Schema.Types.ObjectId, ref: 'Task', required: true } },
  { timestamps: true }
);

savedTaskSchema.index({ user: 1, task: 1 }, { unique: true });

export const SavedTask = mongoose.model('SavedTask', savedTaskSchema);
