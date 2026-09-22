import { scheduleTaskExpiry } from './expireTasks.job.js';
import { scheduleApplicationExpiry } from './expireApplications.job.js';
import { scheduleSubscriptionExpiry } from './expireSubscriptions.job.js';
import { scheduleNotificationCleanup } from './cleanupNotifications.job.js';

export function startScheduledJobs() {
  scheduleTaskExpiry();
  scheduleApplicationExpiry();
  scheduleSubscriptionExpiry();
  scheduleNotificationCleanup();
}
