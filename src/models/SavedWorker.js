import mongoose from 'mongoose';
const { Schema } = mongoose;

// Mirrors SavedTask.js exactly - same shape, same pattern, just for workers
// instead of tasks (per spec §13).
const savedWorkerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // the client who saved
    worker: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

savedWorkerSchema.index({ user: 1, worker: 1 }, { unique: true });

export const SavedWorker = mongoose.model('SavedWorker', savedWorkerSchema);
