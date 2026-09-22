import { PlatformSetting } from '../models/index.js';
import { env } from '../config/env.js';

let cached = null;
let cachedAt = 0;
const CACHE_MS = 30_000;

/**
 * Returns the single platform settings document, creating it from env defaults
 * on first boot. Cached briefly in-memory since this is read on almost every
 * task/order/withdrawal action.
 */
export async function getPlatformSettings() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  let settings = await PlatformSetting.findOne({ key: 'GLOBAL' });
  if (!settings) {
    settings = await PlatformSetting.create({
      key: 'GLOBAL',
      commissionPercent: env.platformDefaults.commissionPercent,
      proCommissionPercent: env.platformDefaults.proCommissionPercent,
      freeApplicationLimit: env.platformDefaults.freeApplicationLimit,
      withdrawalFeeKobo: env.platformDefaults.withdrawalFeeKobo,
      proMonthlyPriceKobo: env.platformDefaults.proMonthlyPriceKobo,
    });
  }
  cached = settings;
  cachedAt = Date.now();
  return settings;
}

export function invalidatePlatformSettingsCache() {
  cached = null;
}

export function getCommissionPercentForUser(user, settings) {
  return user.plan === 'PRO' ? settings.proCommissionPercent : settings.commissionPercent;
}
