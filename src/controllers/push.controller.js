import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/apiResponse.js';
import { env } from '../config/env.js';
import * as pushService from '../services/push.service.js';

export const getVapidPublicKey = asyncHandler(async (req, res) => {
  if (!env.push.publicKey) {
    throw new AppError('Push notifications are not configured on this server yet (missing VAPID keys)', 503);
  }
  return ok(res, { publicKey: env.push.publicKey });
});

export const subscribe = asyncHandler(async (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint || !subscription?.keys) {
    throw new AppError('A valid push subscription is required', 400);
  }
  await pushService.saveSubscription(req.user._id, subscription, req.headers['user-agent']);
  return ok(res, { message: 'Subscribed to push notifications' });
});

export const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) throw new AppError('endpoint is required', 400);
  await pushService.removeSubscription(req.user._id, endpoint);
  return ok(res, { message: 'Unsubscribed from push notifications' });
});
