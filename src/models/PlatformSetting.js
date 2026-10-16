
import mongoose from 'mongoose';

const { Schema } = mongoose;

// Singleton document.
// Orders and Transactions freeze their commissionPercent at creation time,
// so changing these settings never rewrites financial history.
const platformSettingSchema = new Schema(
  {
    key: {
      type: String,
      default: 'GLOBAL',
      unique: true,
    },

    // Platform commissions and application limits
    commissionPercent: {
      type: Number,
      default: 5,
    },
    proCommissionPercent: {
      type: Number,
      default: 3,
    },
    freeApplicationLimit: {
      type: Number,
      default: 10,
    },

    // Withdrawal and subscription pricing (amounts in kobo)
    withdrawalFeeKobo: {
      type: Number,
      default: 0,
    },
    proMonthlyPriceKobo: {
      type: Number,
      default: 250000,
    },

    // Featured task pricing (amounts in kobo)
    featuredTaskPriceKobo: {
      type: Number,
      default: 100000, // ₦1,000 default boost fee
    },
    featuredTaskDurationDays: {
      type: Number,
      default: 7, // Boost duration after payment
    },

    // Attachments and task revisions
    maxAttachmentSizeMb: {
      type: Number,
      default: 5,
    },
    maxRevisions: {
      type: Number,
      default: 3,
    },

    // Supported platform locations
    supportedLocations: [
      {
        type: String,
      },
    ],

    // Gig marketplace limits (spec §5).
    // Consumed by services/planLimits.service.js.
    freeGigLimit: {
      type: Number,
      default: 3,
    },
    proGigLimit: {
      type: Number,
      default: 15,
    },
    maxGigImages: {
      type: Number,
      default: 5,
    },
    maxGigImageSizeMb: {
      type: Number,
      default: 5,
    },

    // Admin who last updated these settings
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export const PlatformSetting = mongoose.model(
  'PlatformSetting',
  platformSettingSchema
);
