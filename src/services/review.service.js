import { Review, Order, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';

export async function createReview(reviewerId, orderId, { rating, comment }) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);
  if (order.status !== 'COMPLETED') throw new AppError('Reviews can only be left on completed orders', 400);

  const uid = String(reviewerId);
  let revieweeId;
  let reviewerRole;
  if (String(order.client) === uid) {
    revieweeId = order.worker;
    reviewerRole = 'CLIENT';
  } else if (String(order.worker) === uid) {
    revieweeId = order.client;
    reviewerRole = 'WORKER';
  } else {
    throw new AppError('You are not part of this order', 403);
  }

  if (String(revieweeId) === uid) throw new AppError('You cannot review yourself', 400);

  let review;
  try {
    review = await Review.create({ order: orderId, reviewer: reviewerId, reviewee: revieweeId, reviewerRole, rating, comment });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You have already reviewed this order', 400);
    throw err;
  }

  await recalculateAggregateRating(revieweeId, reviewerRole);

  await notify({
    userId: revieweeId,
    type: 'NEW_REVIEW',
    title: 'New review received',
    body: `You received a ${rating}-star review`,
    entityType: 'ORDER',
    entityId: orderId,
  });
  const reviewee = await User.findById(revieweeId);
  if (reviewee) emailService.sendNewReview(reviewee, review);

  return review;
}

/**
 * Recomputes a user's aggregate rating from their Review documents. Cheap enough
 * to run on every new review since it's a single indexed aggregation query, and
 * guarantees the denormalized field on User can never drift or be manipulated
 * directly by a user.
 */
async function recalculateAggregateRating(userId, reviewerRoleOfIncomingReview) {
  // A CLIENT's reviews of a WORKER update the worker's `rating`; a WORKER's
  // reviews of a CLIENT update the client's `clientRating`.
  const targetField = reviewerRoleOfIncomingReview === 'CLIENT' ? 'worker' : 'client';

  const stats = await Review.aggregate([
    { $match: { reviewee: userId, reviewerRole: reviewerRoleOfIncomingReview } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  const avg = stats[0]?.avg || 0;
  const count = stats[0]?.count || 0;

  if (targetField === 'worker') {
    await User.updateOne({ _id: userId }, { rating: avg, reviewCount: count });
  } else {
    await User.updateOne({ _id: userId }, { clientRating: avg, clientReviewCount: count });
  }
}

export async function getReviewsForUser(userId, { page, limit, skip }) {
  const filter = { reviewee: userId };
  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('reviewer', 'fullName username profileImage'),
    Review.countDocuments(filter),
  ]);
  return { items, total };
}

export async function getReviewForOrder(orderId, reviewerId) {
  return Review.findOne({
    order: orderId,
    reviewer: reviewerId,
  }).populate(
    'reviewer',
    'fullName username profileImage'
  );
}
