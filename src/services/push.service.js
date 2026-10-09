import webpush from 'web-push';
import { PushSubscription } from '../models/index.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!env.push.publicKey || !env.push.privateKey) return false;
  webpush.setVapidDetails(env.push.subject, env.push.publicKey, env.push.privateKey);
  configured = true;
  return true;
}

export async function saveSubscription(userId, subscription, userAgent) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Invalid push subscription');
  }
  return PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { user: userId, endpoint: subscription.endpoint, keys: subscription.keys, userAgent },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function removeSubscription(userId, endpoint) {
  return PushSubscription.deleteOne({ user: userId, endpoint });
}

/**
 * Sends a push notification to every device/browser a user has subscribed
 * on. Silently no-ops if VAPID keys aren't configured yet, so the rest of
 * the app (in particular notification.service.js#notify, which always
 * creates the in-app notification first) keeps working before push is set
 * up. Prunes subscriptions the push service reports as gone (410/404 -
 * browser data cleared, app uninstalled, etc) so they stop being tried.
 */
export async function sendPushToUser(userId, payload) {
  if (!ensureConfigured()) return;

  const subscriptions = await PushSubscription.find({ user: userId }).lean();
  if (!subscriptions.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          logger.warn(`[push.service] Failed to send push to subscription ${sub._id}: ${err.message}`);
        }
      }
    })
  );
}
