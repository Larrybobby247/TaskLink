
import cron from 'node-cron';
import { Subscription, User } from '../models/index.js';
import { notify } from '../services/notification.service.js';
import { emailService } from '../services/email.service.js';
import { enforceGigLimitForUser } from '../services/planLimits.service.js';
import { logger } from '../utils/logger.js';

/**
 * Daily at 2:00 AM:
 * 1. Expire subscriptions past their endDate.
 * 2. Downgrade the user's plan to FREE.
 * 3. Enforce the Free plan's gig limit without deleting gigs.
 * 4. Notify users when their Pro subscription expires.
 * 5. Warn users whose Pro subscription expires within 3 days.
 */
export function scheduleSubscriptionExpiry() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const now = new Date();

      // Find active subscriptions that have expired.
      const expiring = await Subscription.find({
        status: 'ACTIVE',
        endDate: { $lt: now },
      });

      for (const sub of expiring) {
        try {
          sub.status = 'EXPIRED';
          await sub.save();

          // Downgrade the user to the Free plan.
          await User.updateOne(
            { _id: sub.user },
            {
              $set: {
                plan: 'FREE',
                proExpiresAt: null,
              },
            }
          );

          // Enforce Free plan gig limits.
          // Existing gigs should be paused as needed, not deleted.
          try {
            await enforceGigLimitForUser(sub.user);
          } catch (err) {
            logger.warn(
              `[cron] enforceGigLimitForUser failed for ${sub.user}: ${err.message}`
            );
          }

          // Notify the user that Pro has expired.
          await notify({
            userId: sub.user,
            type: 'PRO_EXPIRING',
            title: 'Pro subscription ended',
            body:
              'Your TaskLink Pro subscription has expired. Renew anytime from Settings.',
          });
        } catch (err) {
          logger.error(
            `[cron] Failed to process expired subscription ${sub._id}: ${err.message}`
          );
        }
      }

      // Find active subscriptions expiring within the next 3 days.
      const warningStart = new Date();
      const warningEnd = new Date(
        warningStart.getTime() + 3 * 24 * 60 * 60 * 1000
      );

      const expiringSoon = await Subscription.find({
        status: 'ACTIVE',
        endDate: {
          $gte: warningStart,
          $lt: warningEnd,
        },
      }).populate('user');

      for (const sub of expiringSoon) {
        try {
          // Skip subscriptions whose user record no longer exists.
          if (!sub.user?._id) continue;

          await notify({
            userId: sub.user._id,
            type: 'PRO_EXPIRING',
            title: 'Pro subscription expiring soon',
            body:
              'Your TaskLink Pro subscription expires in less than 3 days.',
          });
        } catch (err) {
          logger.warn(
            `[cron] Expiry warning failed for subscription ${sub._id}: ${err.message}`
          );
        }
      }

      if (expiring.length) {
        logger.info(
          `[cron] Processed ${expiring.length} expired subscriptions`
        );
      }

      if (expiringSoon.length) {
        logger.info(
          `[cron] Checked ${expiringSoon.length} subscriptions expiring soon`
        );
      }
    } catch (err) {
      logger.error(
        `[cron] expireSubscriptions failed: ${err.message}`
      );
    }
  });
}
