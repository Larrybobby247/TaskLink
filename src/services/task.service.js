
import { Task, SavedTask, Application } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { notifyWorkersOfNewTask } from './taskBroadcast.service.js';

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
