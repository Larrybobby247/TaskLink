import mongoose from 'mongoose';
const { Schema } = mongoose;

// Singleton document. Orders/Transactions freeze their own commissionPercent at
// creation time, so changing these values never rewrites financial history.
const platformSettingSchema = new Schema(
  {
    key: { type: String, default: 'GLOBAL', unique: true },
    commissionPercent: { type: Number, default: 5 },
    proCommissionPercent: { type: Number, default: 3 },
    freeApplicationLimit: { type: Number, default: 10 },
    withdrawalFeeKobo: { type: Number, default: 0 },
    proMonthlyPriceKobo: { type: Number, default: 250000 },
    featuredTaskPriceKobo: { type: Number, default: 100000 },
    maxAttachmentSizeMb: { type: Number, default: 5 },
    maxRevisions: { type: Number, default: 3 },
    supportedLocations: [{ type: String }],
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const PlatformSetting = mongoose.model('PlatformSetting', platformSettingSchema);
