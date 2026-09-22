import { Order, Task } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** For :taskId routes - ensures req.user owns the task (as its client). */
export const requireTaskOwnership = asyncHandler(async (req, res, next) => {
  const task = await Task.findById(req.params.taskId || req.params.id);
  if (!task) throw new AppError('Task not found', 404);
  if (String(task.client) !== String(req.user._id)) throw new AppError('You do not own this task', 403);
  req.task = task;
  next();
});

/** For :orderId routes - ensures req.user is either the client or the worker on the order. */
export const requireOrderParticipant = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.orderId || req.params.id);
  if (!order) throw new AppError('Order not found', 404);
  const uid = String(req.user._id);
  if (String(order.client) !== uid && String(order.worker) !== uid) {
    throw new AppError('You are not part of this order', 403);
  }
  req.order = order;
  next();
});
