import { Task, SavedTask } from '../models/index.js';
import { AppError } from '../utils/AppError.js';

export async function createTask(clientId, payload) {
  return Task.create({ ...payload, client: clientId, status: 'DRAFT' });
}

export async function publishTask(clientId, taskId) {
  const task = await Task.findOne({ _id: taskId, client: clientId });
  if (!task) throw new AppError('Task not found', 404);
  if (!['DRAFT', 'PAUSED'].includes(task.status)) {
    throw new AppError(`Cannot publish a task in status ${task.status}`, 400);
  }
  task.status = 'PUBLISHED';
  task.publishedAt = new Date();
  await task.save();
  return task;
}

export async function pauseTask(clientId, taskId) {
  const task = await Task.findOne({ _id: taskId, client: clientId });
  if (!task) throw new AppError('Task not found', 404);
  if (!['PUBLISHED', 'APPLICATIONS_OPEN'].includes(task.status)) {
    throw new AppError(`Cannot pause a task in status ${task.status}`, 400);
  }
  task.status = 'PAUSED';
  await task.save();
  return task;
}

export async function getTaskById(taskId) {
  const task = await Task.findById(taskId).populate('category').populate('client', 'fullName username profileImage rating reviewCount location');
  if (!task) throw new AppError('Task not found', 404);
  return task;
}

export async function searchTasks({
  q, category, location, isRemote, minBudgetKobo, maxBudgetKobo, sort = 'newest', page, limit, skip,
}) {
  const filter = { status: { $in: ['PUBLISHED', 'APPLICATIONS_OPEN'] } };

  if (q) filter.$text = { $search: q };
  if (category) filter.category = category;
  if (location) filter.location = new RegExp(location, 'i');
  if (isRemote !== undefined) filter.isRemote = isRemote === 'true' || isRemote === true;
  if (minBudgetKobo || maxBudgetKobo) {
    filter.budgetKobo = {};
    if (minBudgetKobo) filter.budgetKobo.$gte = Number(minBudgetKobo);
    if (maxBudgetKobo) filter.budgetKobo.$lte = Number(maxBudgetKobo);
  }
  // Expired tasks should never surface in browse results.
  filter.deadline = { $gte: new Date() };

  const sortMap = {
    newest: { createdAt: -1 },
    highest_paying: { budgetKobo: -1 },
    urgent: { deadline: 1 },
  };

  const [items, total] = await Promise.all([
    Task.find(filter).sort(sortMap[sort] || sortMap.newest).skip(skip).limit(limit).populate('category'),
    Task.countDocuments(filter),
  ]);
  return { items, total };
}

export async function saveTask(userId, taskId) {
  try {
    return await SavedTask.create({ user: userId, task: taskId });
  } catch (err) {
    if (err.code === 11000) throw new AppError('Task already saved', 400);
    throw err;
  }
}

export async function unsaveTask(userId, taskId) {
  return SavedTask.deleteOne({ user: userId, task: taskId });
}

export async function getSavedTasks(userId, { page, limit, skip }) {
  const [items, total] = await Promise.all([
    SavedTask.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate({ path: 'task', populate: 'category' }),
    SavedTask.countDocuments({ user: userId }),
  ]);
  return { items, total };
}
