import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import * as subscriptionService from '../services/subscription.service.js';
import { env } from '../config/env.js';

export const initializeSubscription = asyncHandler(async (req, res) => {
  const result = await subscriptionService.initializeProSubscription(req.user);
  return created(res, { ...result, publicKey: env.paystack.publicKey });
});

export const getMySubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.getActiveSubscription(req.user._id);
  return ok(res, { subscription });
});

export const cancelSubscription = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelSubscription(req.user._id);
  return ok(res, { subscription });
});
