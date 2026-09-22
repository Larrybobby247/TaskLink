import { ApplicationUsage } from '../models/index.js';

function currentPeriodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getApplicationsUsedThisMonth(userId) {
  const doc = await ApplicationUsage.findOne({ user: userId, periodKey: currentPeriodKey() });
  return doc?.applicationsUsed || 0;
}

/** Atomically increments (or creates) this month's usage counter. */
export async function incrementApplicationUsage(userId) {
  const periodKey = currentPeriodKey();
  const doc = await ApplicationUsage.findOneAndUpdate(
    { user: userId, periodKey },
    { $inc: { applicationsUsed: 1 } },
    { upsert: true, new: true }
  );
  return doc.applicationsUsed;
}

export async function canApply(user, settings) {
  if (user.plan === 'PRO') return { allowed: true, remaining: Infinity };
  const used = await getApplicationsUsedThisMonth(user._id);
  const limit = settings.freeApplicationLimit;
  return { allowed: used < limit, remaining: Math.max(0, limit - used), used, limit };
}
