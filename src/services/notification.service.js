import { Notification } from '../models/index.js';

/**
 * Creates an in-app notification. Email sending (via email.service.js) is
 * triggered separately by the calling service so an email failure never
 * blocks the in-app notification from being recorded.
 */
export async function notify({ userId, type, title, body, entityType = 'NONE', entityId = undefined }) {
  return Notification.create({
    user: userId,
    type,
    title,
    body,
    link: { entityType, entityId },
  });
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
