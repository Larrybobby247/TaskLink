import mongoose from 'mongoose';
const { Schema } = mongoose;

export const GIG_STATUSES = ['DRAFT', 'PUBLISHED', 'PAUSED'];

// Optional tiered pricing. A gig with an empty `packages` array is a simple
// single-price gig (startingPriceKobo / deliveryDays / revisions on the gig
// itself apply) - per spec §4.2, workers are never forced into packages.
const packageSchema = new Schema(
  {
    name: { type: String, enum: ['BASIC', 'STANDARD', 'PREMIUM'], required: true },
    priceKobo: { type: Number, required: true, min: 0 },
    deliveryDays: { type: Number, required: true, min: 1 },
    revisions: { type: Number, default: 1, min: 0 },
    deliverables: [{ type: String, trim: true }],
  },
  { _id: false }
);

const gigImageSchema = new Schema({ url: String, publicId: String }, { _id: false });

const gigSchema = new Schema(
  {
    worker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    skills: [{ type: String, trim: true, lowercase: true }],
    description: { type: String, required: true, maxlength: 5000 },

    images: [gigImageSchema],
    coverImage: gigImageSchema,
    portfolioUrl: { type: String, trim: true },

    // Simple pricing (always present, used when packages is empty, and as
    // the "starting at" price shown on cards even when packages exist).
    startingPriceKobo: { type: Number, required: true, min: 0 },
    deliveryDays: { type: Number, required: true, min: 1 },
    revisions: { type: Number, default: 1, min: 0 },

    included: [{ type: String, trim: true }],
    excluded: [{ type: String, trim: true }],
    requirementsFromClient: { type: String, maxlength: 2000 },

    packages: [packageSchema],

    status: { type: String, enum: GIG_STATUSES, default: 'DRAFT', index: true },
    publishedAt: Date,

    // Incremented on each gig-detail view; used only as one input to the
    // Featured Gigs ranking (see gig.service.js#getFeaturedGigs) - never
    // used to fabricate a rating.
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

gigSchema.index({ title: 'text', description: 'text', skills: 'text' });
gigSchema.index({ category: 1, status: 1, createdAt: -1 });
gigSchema.index({ worker: 1, status: 1 });

export const Gig = mongoose.model('Gig', gigSchema);
