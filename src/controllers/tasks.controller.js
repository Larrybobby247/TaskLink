import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as taskService from '../services/task.service.js';
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
  const task = await Task.findOne({ _id: req.params.id, client: req.user._id });
  if (!task) throw new AppError('Task not found', 404);
  if (!['DRAFT', 'PAUSED'].includes(task.status)) {
    throw new AppError('Only draft or paused tasks can be edited', 400);
  }
  Object.assign(task, req.body);
  await task.save();
  return ok(res, { task });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, client: req.user._id });
  if (!task) throw new AppError('Task not found', 404);
  if (!['DRAFT'].includes(task.status)) throw new AppError('Only draft tasks can be deleted', 400);
  await task.deleteOne();
  return ok(res, { message: 'Task deleted' });
});

export const getTask = asyncHandler(async (req, res) => {
  const task = await taskService.getTaskById(req.params.id);
  return ok(res, { task });
});

export const searchTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await taskService.searchTasks({ ...req.query, page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

export const getMyTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { client: req.user._id };
  if (req.query.status) filter.status = req.query.status;
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
