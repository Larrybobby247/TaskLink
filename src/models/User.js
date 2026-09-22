import mongoose from 'mongoose';
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },

    profileImage: { url: String, publicId: String },
    bio: { type: String, maxlength: 500 },
    location: { type: String, trim: true },
    school: { type: String, trim: true },

    // Interface preference only. Backend authorization NEVER relies solely on this.
    currentMode: { type: String, enum: ['client', 'worker'], default: 'client' },

    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    identityVerified: { type: Boolean, default: false },

    accountStatus: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], default: 'ACTIVE', index: true },
    role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },

    plan: { type: String, enum: ['FREE', 'PRO'], default: 'FREE' },
    proExpiresAt: { type: Date },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    completedTasksAsWorker: { type: Number, default: 0 },
    completedTasksAsClient: { type: Number, default: 0 },

    clientRating: { type: Number, default: 0, min: 0, max: 5 },
    clientReviewCount: { type: Number, default: 0 },

    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },

    notificationPreferences: {
      email: {
        applications: { type: Boolean, default: true },
        payments: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        marketing: { type: Boolean, default: true },
      },
    },

    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ fullName: 'text', username: 'text' });

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

export const User = mongoose.model('User', userSchema);
