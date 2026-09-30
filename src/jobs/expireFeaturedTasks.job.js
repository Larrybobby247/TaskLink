import cron from 'node-cron';
import { Task } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Every 15 minutes: clear isFeatured on tasks whose boost period has ended,
 * so expired boosts stop being pinned to the top of search results (see
 * task.service.js#searchTasks, which sorts on isFeatured directly).
 */
export function scheduleFeaturedTaskExpiry() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await Task.updateMany(
        { isFeatured: true, featuredUntil: { $lt: new Date() } },
        { isFeatured: false }
      );
      if (result.modifiedCount) logger.info(`[cron] Un-featured ${result.modifiedCount} expired boosted tasks`);
    } catch (err) {
      logger.error(`[cron] expireFeaturedTasks failed: ${err.message}`);
    }
  });
}
