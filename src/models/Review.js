import mongoose from 'mongoose';
const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewee: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewerRole: { type: String, enum: ['CLIENT', 'WORKER'], required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

reviewSchema.index({ order: 1, reviewer: 1 }, { unique: true });

export const Review = mongoose.model('Review', reviewSchema);
