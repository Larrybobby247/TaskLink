import { asyncHandler } from '../utils/asyncHandler.js';
import { paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as reviewService from '../services/review.service.js';
import Review from '../models/Review.js';
import Order from '../models/Order.js';

export const getUserReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await reviewService.getReviewsForUser(req.params.userId, { page, limit, skip });
  return paginated(res, items, { page, limit, total });
});
export const getOrderReview = asyncHandler(async (req, res) => {
  const review = await reviewService.getReviewForOrder(
    req.params.orderId,
    req.user._id
  );

  return res.json({ review });
});

export const createReview = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || !comment?.trim()) {
      return res.status(400).json({ message: 'Rating and comment are required.' });
    }

    const order = await Order.findById(orderId).populate('client worker');

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (String(order.client._id) !== String(req.user._id)) {
      return res.status(403).json({
        message: 'Only the client can review this order.',
      });
    }

    if (order.status !== 'COMPLETED') {
      return res.status(400).json({
        message: 'This order is not completed yet.',
      });
    }

    const existingReview = await Review.findOne({
      order: orderId,
      reviewer: req.user._id,
    });

    if (existingReview) {
      return res.status(409).json({
        message: 'You have already reviewed this order.',
      });
    }

    const review = await Review.create({
      order: orderId,
      reviewer: req.user._id,
      worker: order.worker._id,
      rating,
      comment: comment.trim(),
    });

    return res.status(201).json({ review });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: 'You have already reviewed this order.',
      });
    }

    return res.status(500).json({
      message: 'Unable to submit review.',
      error: error.message,
    });
  }
};

export const getOrderReview = async (req, res) => {
  try {
    const review = await Review.findOne({
      order: req.params.orderId,
      reviewer: req.user._id,
    }).lean();

    if (!review) {
      return res.status(404).json({ message: 'No review found.' });
    }

    return res.status(200).json({ review });
  } catch (error) {
    return res.status(500).json({
      message: 'Unable to fetch review.',
      error: error.message,
    });
  }
};
