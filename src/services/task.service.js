import { Task, SavedTask, Application } from '../models/index.js';
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

/**
 * `viewerId` is optional (routes use attachUserIfPresent, not requireAuth, so
 * anonymous browsing still works). When present, we attach `hasApplied` +
 * `myApplicationStatus` so the frontend can show "Applied" instead of "Apply"
 * without a follow-up request per task.
 */
export async function getTaskById(taskId, viewerId) {
  const task = await Task.findById(taskId)
    .populate('category')
    .populate('client', 'fullName username profileImage rating reviewCount location')
    .lean();
  if (!task) throw new AppError('Task not found', 404);

  if (viewerId) {
    const existing = await Application.findOne({ task: taskId, worker: viewerId }).select('status').lean();
    task.hasApplied = Boolean(existing);
    task.myApplicationStatus = existing?.status || null;
  } else {
    task.hasApplied = false;
    task.myApplicationStatus = null;
  }

  return task;
}

export async function searchTasks({
  q, category, location, isRemote, minBudgetKobo, maxBudgetKobo, sort = 'newest', page, limit, skip, viewerId,
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

  // Boosted tasks are always pinned above everything else, regardless of the
  // chosen sort - the requested sort still applies as the secondary key
  // within each group (boosted vs. not). `isFeatured` is kept accurate by a
  // scheduled job that clears it once `featuredUntil` passes (see
  // jobs/expireFeaturedTasks.job.js), so this is safe to sort on directly.
  const effectiveSort = { isFeatured: -1, ...(sortMap[sort] || sortMap.newest) };

  const [items, total] = await Promise.all([
      // FIX: `client` must be populated here (not just `category`) so the
      // frontend's `isOwner` check (task.client._id === current user) actually
      // works in list views (Home, Browse) - without this, every list showed
      // "Apply" even on the client's own tasks, because task.client was just a
      // raw ObjectId string with no `_id` property to compare against.
      Task.find(filter).sort(effectiveSort).skip(skip).limit(limit)
        .populate('category')
        .populate('client', 'fullName username profileImage')
        .lean(),
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
