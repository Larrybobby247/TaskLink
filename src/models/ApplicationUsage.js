import mongoose from 'mongoose';
const { Schema } = mongoose;

// One document per user per calendar month (periodKey = 'YYYY-MM'). Avoids counting
// all historical applications on every check.
const applicationUsageSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    periodKey: { type: String, required: true },
    applicationsUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

applicationUsageSchema.index({ user: 1, periodKey: 1 }, { unique: true });

export const ApplicationUsage = mongoose.model('ApplicationUsage', applicationUsageSchema);
