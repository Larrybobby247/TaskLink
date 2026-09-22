import cron from 'node-cron';
import { Task } from '../models/index.js';
import { logger } from '../utils/logger.js';

/** Every 15 minutes: move tasks whose deadline has passed into EXPIRED, and stop
 * accepting new applications on them (enforced in application.service.js too). */
export function scheduleTaskExpiry() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await Task.updateMany(
        { deadline: { $lt: new Date() }, status: { $in: ['PUBLISHED', 'APPLICATIONS_OPEN', 'DRAFT'] } },
        { status: 'EXPIRED' }
      );
      if (result.modifiedCount) logger.info(`[cron] Expired ${result.modifiedCount} tasks`);
    } catch (err) {
      logger.error(`[cron] expireTasks failed: ${err.message}`);
    }
  });
}
