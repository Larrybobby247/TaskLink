import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as orderService from '../services/order.service.js';
import * as reviewService from '../services/review.service.js';
import * as disputeService from '../services/dispute.service.js';
import { Order } from '../models/index.js';

export const selectWorker = asyncHandler(async (req, res) => {
  const order = await orderService.selectWorker(req.user._id, req.body.applicationId);
  return created(res, { order });
});

export const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.params.id);
  return ok(res, { order });
});

export const getMyOrdersAsClient = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { client: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('task worker'),
    Order.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const getMyOrdersAsWorker = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { worker: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('task client'),
    Order.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const submitWork = asyncHandler(async (req, res) => {
  const order = await orderService.submitWork(req.user._id, req.params.id, req.body);
  return ok(res, { order });
});

export const requestRevision = asyncHandler(async (req, res) => {
  const order = await orderService.requestRevision(req.user._id, req.params.id, req.body);
  return ok(res, { order });
});

export const approveOrder = asyncHandler(async (req, res) => {
  const order = await orderService.approveOrder(req.user._id, req.params.id);
  return ok(res, { order });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.user._id, req.params.id, req.body.reason);
  return ok(res, { order });
});

export const leaveReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.params.id, req.body);
  return created(res, { review });
});

export const openDispute = asyncHandler(async (req, res) => {
  const dispute = await disputeService.openDispute(req.user._id, req.params.id, req.body);
  return created(res, { dispute });
});
