import cron from 'node-cron';
import { Application, Task } from '../models/index.js';
import { logger } from '../utils/logger.js';

/** Every 15 minutes: expire pending applications on tasks whose deadline has passed. */
export function scheduleApplicationExpiry() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const expiredTasks = await Task.find({ status: 'EXPIRED' }).select('_id');
      const taskIds = expiredTasks.map((t) => t._id);
      if (!taskIds.length) return;
      const result = await Application.updateMany(
        { task: { $in: taskIds }, status: { $in: ['PENDING', 'SHORTLISTED'] } },
        { status: 'EXPIRED' }
      );
      if (result.modifiedCount) logger.info(`[cron] Expired ${result.modifiedCount} applications`);
    } catch (err) {
      logger.error(`[cron] expireApplications failed: ${err.message}`);
    }
  });
}
