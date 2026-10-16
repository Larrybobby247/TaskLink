
import mongoose from 'mongoose';

import {
  User,
  WorkerProfile,
  Task,
  Application,
  SavedWorker,
} from '../models/index.js';

import { AppError } from '../utils/AppError.js';
import { selectWorker } from './order.service.js';

export async function getOrCreateWorkerProfile(userId) {
  let profile = await WorkerProfile.findOne({ user: userId });

  if (!profile) {
    profile = await WorkerProfile.create({ user: userId });
  }

  return profile;
}

export async function updateWorkerProfile(userId, payload) {
  const REQUIRED_FOR_COMPLETE = [
    'skills',
    'headline',
    'categories',
  ];

  const profile = await WorkerProfile.findOneAndUpdate(
    { user: userId },
    { $set: payload },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  profile.isComplete = REQUIRED_FOR_COMPLETE.every((field) => {
    const value = profile[field];

    return Array.isArray(value)
      ? value.length > 0
      : Boolean(value);
  });

  await profile.save();

  return profile;
}

/**
 * Search worker profiles using user-level and profile-level filters.
 *
 * User-level filters:
 * - q
 * - location
 * - minRating
 *
 * Worker-profile filters:
 * - skill
 * - category
 * - availability
 *
 * Gig pricing filters should be applied in gig.service.js because
 * prices belong to individual gigs, not to worker profiles.
 */
export async function searchWorkers({
  q,
  skill,
  category,
  location,
  minRating,
  availability,
  page,
  limit,
  skip,
}) {
  const userFilter = {};

  if (q) {
    userFilter.$text = { $search: q };
  }

  if (location) {
    const escapedLocation = String(location).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

    userFilter.location = new RegExp(escapedLocation, 'i');
  }

  if (minRating !== undefined && minRating !== '') {
    const rating = Number(minRating);

    if (Number.isFinite(rating)) {
      userFilter.rating = { $gte: rating };
    }
  }

  const profileFilter = {};

  if (skill) {
    profileFilter.skills = String(skill).toLowerCase();
  }

  if (category) {
    profileFilter.categories = category;
  }

  if (availability) {
    profileFilter.availability = availability;
  }

  // Find users matching user-level criteria first.
  const matchingUsers = await User.find(userFilter)
    .select('_id')
    .lean();

  profileFilter.user = {
    $in: matchingUsers.map((user) => user._id),
  };

  const [items, total] = await Promise.all([
    WorkerProfile.find(profileFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(
        'user',
        'fullName username profileImage rating reviewCount completedTasksAsWorker location identityVerified'
      )
      .populate('categories'),

    WorkerProfile.countDocuments(profileFilter),
  ]);

  return { items, total };
}

export async function getWorkerPublicProfile(userIdentifier) {
  if (
    typeof userIdentifier !== 'string' ||
    !userIdentifier.trim()
  ) {
    throw new AppError('Worker not found', 404);
  }

  const identifier = userIdentifier.trim();

  const lookupConditions = [
    { username: identifier },
  ];

  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    lookupConditions.unshift({
      _id: new mongoose.Types.ObjectId(identifier),
    });
  }

  const user = await User.findOne({
    $or: lookupConditions,
  }).select('-passwordHash');

  if (!user) {
    throw new AppError('Worker not found', 404);
  }

  const profile = await WorkerProfile.findOne({
    user: user._id,
  }).populate('categories');

  return { user, profile };
}

// -----------------------------------------------------------------------------
// Saved workers
// -----------------------------------------------------------------------------

export async function saveWorker(clientId, workerId) {
  if (String(clientId) === String(workerId)) {
    throw new AppError('You cannot save yourself', 400);
  }

  const worker = await User.findById(workerId)
    .select('_id')
    .lean();

  if (!worker) {
    throw new AppError('Worker not found', 404);
  }

  try {
    return await SavedWorker.create({
      user: clientId,
      worker: workerId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError('Worker already saved', 400);
    }

    throw err;
  }
}

export async function unsaveWorker(clientId, workerId) {
  return SavedWorker.deleteOne({
    user: clientId,
    worker: workerId,
  });
}

export async function getSavedWorkers(
  clientId,
  { page, limit, skip }
) {
  const [items, total] = await Promise.all([
    SavedWorker.find({ user: clientId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'worker',
        select:
          'fullName username profileImage rating reviewCount completedTasksAsWorker location',
      }),

    SavedWorker.countDocuments({
      user: clientId,
    }),
  ]);

  return { items, total };
}

// -----------------------------------------------------------------------------
// Direct hiring
// -----------------------------------------------------------------------------

/**
 * Direct hiring creates a task and a single pending application for
 * the selected worker, then delegates to selectWorker() to reuse the
 * existing hiring/order pipeline.
 */
export async function hireWorker(
  client,
  workerId,
  {
    title,
    description,
    budgetKobo,
    deadline,
    categoryId,
  }
) {
  if (String(client._id) === String(workerId)) {
    throw new AppError('You cannot hire yourself', 400);
  }

  if (!mongoose.isValidObjectId(workerId)) {
    throw new AppError('Worker not found', 404);
  }

  if (
    !mongoose.isValidObjectId(categoryId)
  ) {
    throw new AppError('Invalid task category', 400);
  }

  if (
    !title?.trim() ||
    !description?.trim()
  ) {
    throw new AppError(
      'Task title and description are required',
      400
    );
  }

  const parsedBudget = Number(budgetKobo);

  if (
    !Number.isSafeInteger(parsedBudget) ||
    parsedBudget <= 0
  ) {
    throw new AppError(
      'Budget must be a positive integer in kobo',
      400
    );
  }

  const parsedDeadline = new Date(deadline);

  if (
    !deadline ||
    Number.isNaN(parsedDeadline.getTime()) ||
    parsedDeadline <= new Date()
  ) {
    throw new AppError(
      'Please provide a valid future deadline',
      400
    );
  }

  const worker = await User.findById(workerId)
    .select('_id')
    .lean();

  if (!worker) {
    throw new AppError('Worker not found', 404);
  }

  const session = await mongoose.startSession();
  let applicationId;

  try {
    await session.withTransaction(async () => {
      const [task] = await Task.create(
        [
          {
            client: client._id,
            title: title.trim(),
            description: description.trim(),
            category: categoryId,
            budgetType: 'FIXED',
            budgetKobo: parsedBudget,
            isRemote: true,
            deadline: parsedDeadline,
            status: 'PUBLISHED',
            source: 'DIRECT_HIRE',
            publishedAt: new Date(),
          },
        ],
        { session }
      );

      const [application] = await Application.create(
        [
          {
            task: task._id,
            worker: workerId,
            message: 'Direct hire request',
            status: 'PENDING',
          },
        ],
        { session }
      );

      applicationId = application._id;
    });
  } finally {
    await session.endSession();
  }

  return selectWorker(client._id, applicationId);
}
