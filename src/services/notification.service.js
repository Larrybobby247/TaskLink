import { Notification } from '../models/index.js';
import { sendPushToUser } from './push.service.js';


/** Where a push notification should deep-link to when tapped. Kept deliberately
 * conservative: TASK links straight to the task (works for anyone, owner or
 * not); everything else falls back to the in-app notifications list rather
 * than guessing a client-only or worker-only route for the recipient. */
function deriveUrl(entityType, entityId) {
  if (entityType === 'TASK' && entityId) return `/tasks/${entityId}`;
  return '/notifications';
}

/**
 * Creates an in-app notification. Email sending (via email.service.js) is
 * triggered separately by the calling service so an email failure never
 * blocks the in-app notification from being recorded.
 */
export async function notify({ userId, type, title, body, entityType = 'NONE', entityId = undefined }) {
  const notification = await Notification.create({
    user: userId,
    type,
    title,
    body,
    link: { entityType, entityId },
  });

  sendPushToUser(userId, {
    title,
    body,
    url: deriveUrl(entityType, entityId),
    tag: type,
  }).catch(() => {});

  return notification;
}

export async function getNotifications(userId, { page, limit, skip, unreadOnly }) {
  const filter = { user: userId };
  if (unreadOnly) filter.isRead = false;

  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);
  return { items, total };
}

export async function markAsRead(userId, notificationId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { isRead: true, readAt: new Date() },
    { new: true }
  );
}

export async function markAllAsRead(userId) {
  return Notification.updateMany({ user: userId, isRead: false }, { isRead: true, readAt: new Date() });
}
