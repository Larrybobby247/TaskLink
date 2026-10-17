
import mongoose from 'mongoose';

import {
  User,
  WorkerProfile,
  Task,
  Application,
  SavedWorker,
  Category,
  Gig,
} from '../models/index.js';
import { PUBLIC_USER_FIELDS } from '../models/User.js';

import { AppError } from '../utils/AppError.js';
import { escapeRegex, tokenizeQuery } from '../utils/search.js';
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

// Only these user fields may ever appear in search results / public profiles.
// (Never email, phone, bank details, plan expiry, referral data...)
const PUBLIC_USER_KEYS = PUBLIC_USER_FIELDS.split(' ');

function toPublicUser(user) {
  const out = { _id: user._id };
  for (const key of PUBLIC_USER_KEYS) if (user[key] !== undefined) out[key] = user[key];
  return out;
}

/**
 * Search workers (spec section 3).
 *
 * Free text `q` is matched case-insensitively and PARTIALLY against the
 * username, display name, headline, skills, service category names and the
 * titles/skills of the worker's published gigs. Every word must match
 * somewhere. An exact username match is ranked first, so searching
 * "larrydev" puts @larrydev on top and "larry" still finds him.
 * (The previous Mongo $text search only matched whole words, so partial
 * usernames never matched.)
 *
 * Only ACTIVE accounts are returned, and no private fields are ever included.
 * Each result also carries the worker's real published-gig count and lowest
 * published gig price, computed from the Gig collection (never invented).
 */
export async function searchWorkers({
  q,
  skill,
  category,
  location,
  minRating,
  availability,
  minPriceKobo,
  maxPriceKobo,
  skip = 0,
  limit = 20,
}) {
  const terms = tokenizeQuery(q);
  const exactUsername = typeof q === 'string' ? q.trim().toLowerCase().replace(/^@/, '') : '';

  const profileMatch = {};
  if (skill) profileMatch.skills = String(skill).toLowerCase();
  if (category) profileMatch.categories = new mongoose.Types.ObjectId(category);
  if (availability) profileMatch.availability = availability;

  if (minPriceKobo || maxPriceKobo) {
    const range = {};
    if (minPriceKobo) range.$gte = Number(minPriceKobo);
    if (maxPriceKobo) range.$lte = Number(maxPriceKobo);
    profileMatch.user = { $in: await Gig.distinct('worker', { status: 'PUBLISHED', startingPriceKobo: range }) };
  }

  const userMatch = { 'user.accountStatus': 'ACTIVE' };
  if (location) userMatch['user.location'] = new RegExp(escapeRegex(location), 'i');
  if (minRating !== undefined && minRating !== '' && Number.isFinite(Number(minRating))) {
    userMatch['user.rating'] = { $gte: Number(minRating) };
  }

  const termClauses = [];
  for (const term of terms) {
    const re = new RegExp(escapeRegex(term), 'i');
    const options = [{ 'user.username': re }, { 'user.fullName': re }, { headline: re }, { skills: re }];

    if (term.length >= 2) {
      const [categoryIds, gigWorkerIds] = await Promise.all([
        Category.distinct('_id', { name: re }),
        Gig.distinct('worker', { status: 'PUBLISHED', $or: [{ title: re }, { skills: re }] }),
      ]);
      if (categoryIds.length) options.push({ categories: { $in: categoryIds } });
      if (gigWorkerIds.length) options.push({ 'user._id': { $in: gigWorkerIds } });
    }
    termClauses.push({ $or: options });
  }

  const [result] = await WorkerProfile.aggregate([
    { $match: profileMatch },
    { $lookup: { from: User.collection.name, localField: 'user', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { ...userMatch, ...(termClauses.length ? { $and: termClauses } : {}) } },
    { $addFields: { exactUsername: { $cond: [{ $eq: ['$user.username', exactUsername] }, 1, 0] } } },
    {
      $sort: {
        exactUsername: -1,
        'user.rating': -1,
        'user.completedTasksAsWorker': -1,
        createdAt: -1,
        _id: 1,
      },
    },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const rawItems = result?.items || [];
  const total = result?.total?.[0]?.n || 0;
  if (!rawItems.length) return { items: [], total };

  const workerIds = rawItems.map((p) => p.user._id);
  const categoryIds = [...new Set(rawItems.flatMap((p) => (p.categories || []).map(String)))];

  const [categories, gigStats] = await Promise.all([
    Category.find({ _id: { $in: categoryIds } }).select('name slug icon').lean(),
    Gig.aggregate([
      { $match: { worker: { $in: workerIds }, status: 'PUBLISHED' } },
      { $group: { _id: '$worker', count: { $sum: 1 }, minPrice: { $min: '$startingPriceKobo' } } },
    ]),
  ]);
  const categoryById = new Map(categories.map((c) => [String(c._id), c]));
  const statsByWorker = new Map(gigStats.map((g) => [String(g._id), g]));

  const items = rawItems.map((p) => {
    const stats = statsByWorker.get(String(p.user._id));
    return {
      _id: p._id,
      user: toPublicUser(p.user),
      headline: p.headline,
      skills: p.skills || [],
      categories: (p.categories || []).map((id) => categoryById.get(String(id))).filter(Boolean),
      availability: p.availability,
      isComplete: p.isComplete,
      publishedGigCount: stats?.count || 0,
      startingPriceKobo: stats?.minPrice || null,
    };
  });

  return { items, total };
}

/**
 * Public worker profile, looked up by user id OR username (case-insensitive).
 * Returns ONLY allow-listed user fields and never the worker's payout/bank
 * details. Suspended/deactivated accounts are not public.
 * (This used to return the whole user document - including email, phone and
 * bank details - to any unauthenticated visitor.)
 */
export async function getWorkerPublicProfile(userIdentifier) {
  if (typeof userIdentifier !== 'string' || !userIdentifier.trim()) {
    throw new AppError('Worker not found', 404);
  }

  const identifier = userIdentifier.trim();
  const lookupConditions = [{ username: identifier.toLowerCase() }];

  if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
    lookupConditions.unshift({ _id: new mongoose.Types.ObjectId(identifier) });
  }

  const userDoc = await User.findOne({ $or: lookupConditions })
    .select(`${PUBLIC_USER_FIELDS} accountStatus`);

  if (!userDoc || userDoc.accountStatus !== 'ACTIVE') {
    throw new AppError('Worker not found', 404);
  }

  const user = {
    _id: userDoc._id,
    fullName: userDoc.fullName,
    username: userDoc.username,
    profileImage: userDoc.profileImage,
    bio: userDoc.bio,
    location: userDoc.location,
    identityVerified: userDoc.identityVerified,
    rating: userDoc.rating,
    reviewCount: userDoc.reviewCount,
    completedTasksAsWorker: userDoc.completedTasksAsWorker,
    completedTasksAsClient: userDoc.completedTasksAsClient,
    createdAt: userDoc.createdAt,
  };

  const profile = await WorkerProfile.findOne({ user: userDoc._id })
    .select('-bankAccount')
    .populate('categories')
    .lean();

  return { user, profile: profile || null };
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
    .select('_id accountStatus')
    .lean();

  if (!worker || worker.accountStatus !== 'ACTIVE') {
    throw new AppError('Worker not found', 404);
  }

  const workerProfile = await WorkerProfile.findOne({ user: workerId })
    .select('availability')
    .lean();

  if (workerProfile?.availability === 'UNAVAILABLE') {
    throw new AppError("This worker isn't taking new work right now", 400);
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
