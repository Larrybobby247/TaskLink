import mongoose from 'mongoose';
const { Schema } = mongoose;

const portfolioItemSchema = new Schema(
  { title: String, description: String, image: { url: String, publicId: String }, link: String },
  { _id: true, timestamps: true }
);

const workerProfileSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    headline: { type: String, maxlength: 120 },
    skills: [{ type: String, trim: true, lowercase: true }],
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    availability: { type: String, enum: ['AVAILABLE', 'BUSY', 'UNAVAILABLE'], default: 'AVAILABLE' },
    portfolio: [portfolioItemSchema],
    responseRate: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    isComplete: { type: Boolean, default: false },
    bankAccount: {
      bankName: String,
      bankCode: String,
      accountNumber: { type: String, select: false },
      accountNumberLast4: String,
      accountName: String,
      recipientCode: String,
      verifiedAt: Date,
    },
  },
  { timestamps: true }
);

workerProfileSchema.index({ skills: 1 });
workerProfileSchema.index({ categories: 1 });

export const WorkerProfile = mongoose.model('WorkerProfile', workerProfileSchema);
