import { Gig } from '../models/index.js';
import { getPlatformSettings } from './platformSettings.service.js';

/** The single source of truth for "how many published gigs can this user have".
 * Used both when a worker tries to publish a new gig AND when a Pro
 * subscription expires (see jobs/expireSubscriptions.job.js). Never
 * duplicate this number elsewhere - read it from here. */
export function getGigLimitForUser(user, settings) {
  return user.plan === 'PRO' ? settings.proGigLimit : settings.freeGigLimit;
}

export async function getGigLimitAndUsage(user) {
  const settings = await getPlatformSettings();
  const limit = getGigLimitForUser(user, settings);
  const published = await Gig.countDocuments({ worker: user._id, status: 'PUBLISHED' });
  return { limit, published, remaining: Math.max(0, limit - published) };
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
