
import { Task, SavedTask, Application, Order } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { notifyWorkersOfNewTask } from './taskBroadcast.service.js';
import { notify } from './notification.service.js';

export async function createTask(clientId, payload) {
  return Task.create({
    ...payload,
    client: clientId,
    status: 'DRAFT',
  });
}

export async function publishTask(clientId, taskId) {
  const task = await Task.findOne({
    _id: taskId,
    client: clientId,
  });

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  if (!['DRAFT', 'PAUSED'].includes(task.status)) {
    throw new AppError(
      `Cannot publish a task in status ${task.status}`,
      400
    );
  }

  task.status = 'PUBLISHED';
  task.publishedAt = new Date();

  await task.save();

  // Fire-and-forget: notification failures must not fail publishing.
  notifyWorkersOfNewTask(task).catch((err) => {
    console.error(
      '[task] Failed to notify workers about new task:',
      err?.message || err
    );
  });

  return task;
}

export async function pauseTask(clientId, taskId) {
  const task = await Task.findOne({
    _id: taskId,
    client: clientId,
  });

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  if (!['PUBLISHED', 'APPLICATIONS_OPEN'].includes(task.status)) {
    throw new AppError(
      `Cannot pause a task in status ${task.status}`,
      400
    );
  }

  task.status = 'PAUSED';
  await task.save();

  return task;
}

/**
 * Get a single task and optionally annotate it with the current
 * viewer's application status.
 *
 * viewerId is optional so anonymous visitors can view task details.
 */
export async function getTaskById(taskId, viewerId) {
  const task = await Task.findById(taskId)
    .populate('category')
    .populate(
      'client',
      'fullName username profileImage rating reviewCount location'
    )
    .lean();

  if (!task) {
    throw new AppError('Task not found', 404);
  }

  if (viewerId) {
    const existing = await Application.findOne({
      task: taskId,
      worker: viewerId,
    })
      .select('status')
      .lean();

    task.hasApplied = Boolean(existing);
    task.myApplicationStatus = existing?.status || null;
  } else {
    task.hasApplied = false;
    task.myApplicationStatus = null;
  }

  return task;
}

export async function searchTasks({
  q,
  category,
  location,
  isRemote,
  minBudgetKobo,
  maxBudgetKobo,
  sort = 'newest',
  page,
  limit,
  skip,
  viewerId,
}) {
  const filter = {
    status: {
      $in: ['PUBLISHED', 'APPLICATIONS_OPEN'],
    },

    // Only ordinary task posts should appear in the public task feed.
    // Including null and missing values preserves older documents
    // created before the source field was introduced.
    source: {
      $in: ['TASK_POST', null],
    },

    // Expired tasks must not appear in search results.
    deadline: {
      $gte: new Date(),
    },
  };

  if (q) {
    filter.$text = { $search: q };
  }

  if (category) {
    filter.category = category;
  }

  if (location) {
    // Escape special regex characters in user-provided search input.
    const escapedLocation = String(location).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    filter.location = new RegExp(escapedLocation, 'i');
  }

  if (isRemote !== undefined) {
    filter.isRemote = isRemote === 'true' || isRemote === true;
  }

  if (minBudgetKobo !== undefined && minBudgetKobo !== '') {
    filter.budgetKobo = {
      ...filter.budgetKobo,
      $gte: Number(minBudgetKobo),
    };
  }

  if (maxBudgetKobo !== undefined && maxBudgetKobo !== '') {
    filter.budgetKobo = {
      ...filter.budgetKobo,
      $lte: Number(maxBudgetKobo),
    };
  }

  const sortMap = {
    newest: { createdAt: -1 },
    highest_paying: { budgetKobo: -1 },
    urgent: { deadline: 1 },
  };

  // Featured tasks stay first; the selected sort orders tasks within
  // featured and non-featured groups.
  const effectiveSort = {
    isFeatured: -1,
    ...(sortMap[sort] || sortMap.newest),
  };

  const [items, total] = await Promise.all([
    Task.find(filter)
      .sort(effectiveSort)
      .skip(skip)
      .limit(limit)
      .populate('category')
      .populate('client', 'fullName username profileImage')
      .lean(),

    Task.countDocuments(filter),
  ]);

  const annotatedItems = await annotateWithApplicationStatus(
    items,
    viewerId
  );

  return {
    items: annotatedItems,
    total,
  };
}

/**
 * Annotate search results with application status in one query,
 * avoiding a separate database request for every task.
 */
async function annotateWithApplicationStatus(tasks, viewerId) {
  if (!viewerId) {
    return tasks.map((task) => ({
      ...task,
      hasApplied: false,
      myApplicationStatus: null,
    }));
  }

  if (tasks.length === 0) {
    return tasks;
  }

  const applications = await Application.find({
    worker: viewerId,
    task: {
      $in: tasks.map((task) => task._id),
    },
  })
    .select('task status')
    .lean();

  const applicationsByTaskId = new Map(
    applications.map((application) => [
      String(application.task),
      application.status,
    ])
  );

  return tasks.map((task) => {
    const applicationStatus = applicationsByTaskId.get(
      String(task._id)
    );

    return {
      ...task,
      hasApplied: applicationStatus !== undefined,
      myApplicationStatus: applicationStatus || null,
    };
  });
}

export async function saveTask(userId, taskId) {
  try {
    return await SavedTask.create({
      user: userId,
      task: taskId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError('Task already saved', 400);
    }

    throw err;
  }
}

export async function unsaveTask(userId, taskId) {
  return SavedTask.deleteOne({
    user: userId,
    task: taskId,
  });
}

export async function getSavedTasks(
  userId,
  { page, limit, skip }
) {
  const [items, total] = await Promise.all([
    SavedTask.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'task',
        populate: {
          path: 'category',
        },
      }),

    SavedTask.countDocuments({
      user: userId,
    }),
  ]);

  return { items, total };
}

// -----------------------------------------------------------------------------
// Edit / delete (task owner)
// -----------------------------------------------------------------------------

const EDITABLE_STATUSES = ['DRAFT', 'PAUSED', 'PUBLISHED', 'APPLICATIONS_OPEN'];
const DELETABLE_STATUSES = ['DRAFT', 'PAUSED', 'PUBLISHED', 'APPLICATIONS_OPEN', 'EXPIRED', 'CANCELLED'];
const isTaskPost = (task) => !task.source || task.source === 'TASK_POST';

async function findOwnedTask(clientId, taskId) {
  const task = await Task.findOne({ _id: taskId, client: clientId });
  if (!task) throw new AppError('Task not found', 404);
  if (!isTaskPost(task)) {
    throw new AppError('Gig orders and direct hires cannot be edited or deleted here', 400);
  }
  return task;
}

/**
 * Owner edits a task. Allowed until a worker has been selected. Once people have
 * applied, the price is locked so applicants are not bid against a moving target.
 */
export async function updateTask(clientId, taskId, changes) {
  const task = await findOwnedTask(clientId, taskId);

  if (!EDITABLE_STATUSES.includes(task.status)) {
    throw new AppError('This task can no longer be edited because a worker has already been selected', 400);
  }

  const touchesPrice = ['budgetKobo', 'budgetType'].some(
    (key) => changes[key] !== undefined && changes[key] !== task[key]
  );
  if (touchesPrice && task.applicationCount > 0) {
    throw new AppError('The budget cannot be changed after workers have applied', 400);
  }

  if (changes.deadline && changes.deadline <= new Date()) {
    throw new AppError('Deadline must be in the future', 400);
  }

  const next = { ...task.toObject(), ...changes };
  if (next.isRemote === false && !String(next.location || '').trim()) {
    throw new AppError('Location is required for on-site tasks', 400);
  }

  Object.assign(task, changes);
  if (task.isRemote) task.location = undefined;
  await task.save();
  return task;
}

/**
 * Owner deletes a task. A task nobody has touched is removed entirely. If workers
 * have applied (or an order was ever created) the task is closed instead, so
 * their history stays intact, and applicants are told.
 */
export async function deleteTask(clientId, taskId) {
  const task = await findOwnedTask(clientId, taskId);

  if (!DELETABLE_STATUSES.includes(task.status)) {
    throw new AppError('This task has a worker assigned. Cancel the order from the order page instead.', 400);
  }

  const [applicationCount, orderExists] = await Promise.all([
    Application.countDocuments({ task: task._id }),
    Order.exists({ task: task._id }),
  ]);

  if (applicationCount === 0 && !orderExists) {
    await SavedTask.deleteMany({ task: task._id });
    await task.deleteOne();
    return { deleted: true, message: 'Task deleted' };
  }

  if (task.status === 'CANCELLED') {
    return { deleted: false, message: 'This task is already closed' };
  }

  const open = await Application.find({ task: task._id, status: { $in: ['PENDING', 'SHORTLISTED'] } }).select('worker');
  await Application.updateMany(
    { _id: { $in: open.map((a) => a._id) } },
    { status: 'EXPIRED' }
  );

  task.status = 'CANCELLED';
  await task.save();

  for (const app of open) {
    notify({
      userId: app.worker,
      type: 'APPLICATION_REJECTED',
      title: 'Task closed',
      body: `The client closed "${task.title}", so your application is no longer active.`,
      entityType: 'TASK',
      entityId: task._id,
    }).catch(() => {});
  }

  return { deleted: false, message: 'Task closed. Workers who applied have been notified.' };
}
