import { WorkerProfile } from '../models/index.js';
import { notify } from './notification.service.js';
import { logger } from '../utils/logger.js';

// Simple safety cap so a single published task can't fan out to an
// unbounded number of notifications/push sends at once. Fine for an
// early-stage platform; revisit with a proper queue/batch job if the
// worker base grows large enough for this to matter.
const MAX_RECIPIENTS = 200;

/**
 * Notifies (in-app + push, via notify()) workers whose profile lists this
 * task's category, so "a new task drops" actually reaches the people likely
 * to care about it rather than every user on the platform. Called from
 * task.service.js#publishTask - fire-and-forget, must never block or fail
 * the publish action itself.
 */
export async function notifyWorkersOfNewTask(task) {
  try {
    const matchingProfiles = await WorkerProfile.find({ categories: task.category })
      .select('user')
      .limit(MAX_RECIPIENTS)
      .lean();

    const workerIds = matchingProfiles
      .map((p) => p.user)
      .filter((id) => String(id) !== String(task.client));

    await Promise.all(
      workerIds.map((workerId) =>
        notify({
          userId: workerId,
          type: 'NEW_TASK',
          title: 'New task posted',
          body: `"${task.title}" was just posted in a category you work in`,
          entityType: 'TASK',
          entityId: task._id,
        })
      )
    );
  } catch (err) {
    logger.warn(`[taskBroadcast.service] Failed to notify workers of new task ${task._id}: ${err.message}`);
  }
}
