import cron from 'node-cron';
import { Notification } from '../models/index.js';
import { logger } from '../utils/logger.js';

/** Weekly: remove read notifications older than 90 days to keep the collection lean. */
export function scheduleNotificationCleanup() {
  cron.schedule('0 3 * * 0', async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const result = await Notification.deleteMany({ isRead: true, createdAt: { $lt: cutoff } });
      if (result.deletedCount) logger.info(`[cron] Cleaned up ${result.deletedCount} old notifications`);
    } catch (err) {
      logger.error(`[cron] cleanupNotifications failed: ${err.message}`);
    }
  });
}
