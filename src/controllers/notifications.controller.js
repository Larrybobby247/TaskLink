import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as notificationService from '../services/notification.service.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await notificationService.getNotifications(req.user._id, { page, limit, skip, unreadOnly: req.query.unreadOnly === 'true' });
  return paginated(res, items, { page, limit, total });
});

export const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.user._id, req.params.id);
  return ok(res, { notification });
});

export const markAllAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);
  return ok(res, { message: 'All notifications marked as read' });
});
