import { asyncHandler } from '../utils/asyncHandler.js';
import { paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as reviewService from '../services/review.service.js';

export const getUserReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await reviewService.getReviewsForUser(req.params.userId, { page, limit, skip });
  return paginated(res, items, { page, limit, total });
});
