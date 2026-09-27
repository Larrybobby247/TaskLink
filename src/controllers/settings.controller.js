import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { getPlatformSettings } from '../services/platformSettings.service.js';

/**
 * Public, read-only subset of platform settings - safe to expose to any
 * client (no auth required). Used to display prices (Pro subscription, task
 * boost) before checkout, so the frontend never hardcodes a fee.
 */
export const getPublicSettings = asyncHandler(async (req, res) => {
  const settings = await getPlatformSettings();
  return ok(res, {
    settings: {
      commissionPercent: settings.commissionPercent,
      proCommissionPercent: settings.proCommissionPercent,
      freeApplicationLimit: settings.freeApplicationLimit,
      proMonthlyPriceKobo: settings.proMonthlyPriceKobo,
      featuredTaskPriceKobo: settings.featuredTaskPriceKobo,
      featuredTaskDurationDays: settings.featuredTaskDurationDays,
    },
  });
});
