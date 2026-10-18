import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as taskService from '../services/task.service.js';
import * as paymentService from '../services/payment.service.js';
import { Task } from '../models/index.js';

export const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(req.user._id, req.body);
  return created(res, { task });
});

export const publishTask = asyncHandler(async (req, res) => {
  const task = await taskService.publishTask(req.user._id, req.params.id);
  return ok(res, { task });
});

export const pauseTask = asyncHandler(async (req, res) => {
  const task = await taskService.pauseTask(req.user._id, req.params.id);
  return ok(res, { task });
});

export const updateTask = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(req.user._id, req.params.id, req.body);
  return ok(res, { task });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const result = await taskService.deleteTask(req.user._id, req.params.id);
  return ok(res, result);
});

// req.user is optional here (route uses attachUserIfPresent, not requireAuth) -
// task.service.js#getTaskById handles a missing viewer id gracefully.
export const getTask = asyncHandler(async (req, res) => {
  const task = await taskService.getTaskById(req.params.id, req.user?._id);
  return ok(res, { task });
});

// Also optional here, for the same reason - anonymous visitors still get
// results, just without a `hasApplied` flag on each task.
export const searchTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await taskService.searchTasks({ ...req.query, page, limit, skip, viewerId: req.user?._id });
  return paginated(res, items, { page, limit, total });
});

export const getMyTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { client: req.user._id };
  if (req.query.status) {
    // Accepts one status or a comma-separated list (e.g. "PUBLISHED,APPLICATIONS_OPEN").
    const statuses = String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean);
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  const [items, total] = await Promise.all([
    Task.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('category'),
    Task.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const saveTask = asyncHandler(async (req, res) => {
  await taskService.saveTask(req.user._id, req.params.id);
  return ok(res, { message: 'Task saved' });
});

export const unsaveTask = asyncHandler(async (req, res) => {
  await taskService.unsaveTask(req.user._id, req.params.id);
  return ok(res, { message: 'Task removed from saved list' });
});

export const getSavedTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await taskService.getSavedTasks(req.user._id, { page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

export const boostTask = asyncHandler(async (req, res) => {
  const result = await paymentService.initializeFeaturedTaskPayment(req.user, req.params.id);
  return ok(res, result);
});
