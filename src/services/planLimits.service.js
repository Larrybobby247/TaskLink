import { Gig } from '../models/index.js';
import { getPlatformSettings } from './platformSettings.service.js';

/** The single source of truth for "how many published gigs can this user have".
 * Used both when a worker tries to publish a new gig AND when a Pro
 * subscription expires (see jobs/expireSubscriptions.job.js). Never
 * duplicate this number elsewhere - read it from here. */
export function isActivePro(user) {
  // The daily cron downgrades expired Pro users, but between expiry and the next
  // run the stored plan is still 'PRO'. An expired date must never grant Pro limits.
  if (user.plan !== 'PRO') return false;
  return !user.proExpiresAt || new Date(user.proExpiresAt) > new Date();
}

export function getGigLimitForUser(user, settings) {
  return isActivePro(user) ? settings.proGigLimit : settings.freeGigLimit;
}

export async function getGigLimitAndUsage(user) {
  const settings = await getPlatformSettings();
  const limit = getGigLimitForUser(user, settings);
  const published = await Gig.countDocuments({ worker: user._id, status: 'PUBLISHED' });
  return {
    limit,
    published,
    remaining: Math.max(0, limit - published),
    plan: isActivePro(user) ? 'PRO' : 'FREE',
    // Read by the gig form so the UI never hardcodes these numbers.
    maxImages: settings.maxGigImages,
    maxImageSizeMB: settings.maxGigImageSizeMb,
  };
}

/**
 * Called when a worker's plan downgrades (Pro subscription expired - see
 * jobs/expireSubscriptions.job.js). Per spec §5: never delete gigs on
 * downgrade. Instead, pause the oldest-published-first gigs beyond the new
 * (lower) limit, keeping the newest N published. The worker can re-publish
 * once they're back within their limit (e.g. by upgrading again, or pausing
 * something else first).
 */
export async function enforceGigLimitForUser(userId) {
  const { User } = await import('../models/index.js');
  const user = await User.findById(userId);
  if (!user) return;

  const settings = await getPlatformSettings();
  const limit = getGigLimitForUser(user, settings);

  const publishedGigs = await Gig.find({ worker: userId, status: 'PUBLISHED' }).sort({ publishedAt: 1 });
  if (publishedGigs.length <= limit) return;

  const excess = publishedGigs.slice(0, publishedGigs.length - limit); // oldest first
  await Gig.updateMany(
    { _id: { $in: excess.map((g) => g._id) } },
    { status: 'PAUSED' }
  );
}
