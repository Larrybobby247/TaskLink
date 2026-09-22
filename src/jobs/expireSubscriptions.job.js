import cron from 'node-cron';
import { Subscription, User } from '../models/index.js';
import { notify } from '../services/notification.service.js';
import { emailService } from '../services/email.service.js';
import { logger } from '../utils/logger.js';

/** Daily: expire Pro subscriptions past their endDate and downgrade the user's plan. */
export function scheduleSubscriptionExpiry() {
  cron.schedule('0 2 * * *', async () => {
    try {
      const expiring = await Subscription.find({ status: 'ACTIVE', endDate: { $lt: new Date() } });
      for (const sub of expiring) {
        sub.status = 'EXPIRED';
        await sub.save();
        await User.updateOne({ _id: sub.user }, { plan: 'FREE', proExpiresAt: null });
        await notify({
          userId: sub.user,
          type: 'PRO_EXPIRING',
          title: 'Pro subscription ended',
          body: 'Your TaskLink Pro subscription has expired. Renew anytime from Settings.',
        });
      }
      // Warn users whose Pro plan expires within the next 3 days.
      const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const expiringSoon = await Subscription.find({ status: 'ACTIVE', endDate: { $lt: soon, $gt: new Date() } }).populate('user');
      for (const sub of expiringSoon) {
        await notify({
          userId: sub.user._id,
          type: 'PRO_EXPIRING',
          title: 'Pro subscription expiring soon',
          body: 'Your TaskLink Pro subscription expires in less than 3 days.',
        });
      }
      if (expiring.length) logger.info(`[cron] Expired ${expiring.length} subscriptions`);
    } catch (err) {
      logger.error(`[cron] expireSubscriptions failed: ${err.message}`);
    }
  });
}
