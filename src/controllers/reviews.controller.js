import { asyncHandler } from '../utils/asyncHandler.js';
import { paginated } from '../utils/apiResponse.js';
import { getPagination, AppError } from '../utils/AppError.js';
import * as reviewService from '../services/review.service.js';

export const getUserReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await reviewService.getReviewsForUser(req.params.userId, {
    page,
    limit,
    skip,
  });

  return paginated(res, items, { page, limit, total });
});

export const getOrderReview = asyncHandler(async (req, res) => {
  const review = await reviewService.getReviewForOrder(req.params.orderId, req.user._id);

  if (!review) {
    throw new AppError('No review found for this order', 404);
  }

  return res.json({ review });
});

export const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.params.orderId, req.body);
  return res.status(201).json({ review });
});
