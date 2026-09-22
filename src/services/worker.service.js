import { User, WorkerProfile } from '../models/index.js';
import { AppError } from '../utils/AppError.js';

export async function getOrCreateWorkerProfile(userId) {
  let profile = await WorkerProfile.findOne({ user: userId });
  if (!profile) {
    profile = await WorkerProfile.create({ user: userId });
  }
  return profile;
}

export async function updateWorkerProfile(userId, payload) {
  const REQUIRED_FOR_COMPLETE = ['skills', 'headline', 'categories'];

  const profile = await WorkerProfile.findOneAndUpdate(
    { user: userId },
    { $set: payload },
    { upsert: true, new: true }
  );

  profile.isComplete = REQUIRED_FOR_COMPLETE.every((field) => {
    const value = profile[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
  await profile.save();
  return profile;
}

export async function searchWorkers({ q, skill, category, location, minRating, availability, page, limit, skip }) {
  const userFilter = {};
  if (q) userFilter.$text = { $search: q };
  if (location) userFilter.location = new RegExp(location, 'i');
  if (minRating) userFilter.rating = { $gte: Number(minRating) };

  const profileFilter = {};
  if (skill) profileFilter.skills = skill.toLowerCase();
  if (category) profileFilter.categories = category;
  if (availability) profileFilter.availability = availability;

  const matchingUsers = await User.find(userFilter).select('_id');
  profileFilter.user = { $in: matchingUsers.map((u) => u._id) };

  const [items, total] = await Promise.all([
    WorkerProfile.find(profileFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'fullName username profileImage rating reviewCount completedTasksAsWorker location identityVerified')
      .populate('categories'),
    WorkerProfile.countDocuments(profileFilter),
  ]);
  return { items, total };
}

export async function getWorkerPublicProfile(userIdentifier) {
  const user = await User.findOne({
    $or: [{ _id: /^[0-9a-fA-F]{24}$/.test(userIdentifier) ? userIdentifier : null }, { username: userIdentifier }],
  }).select('-passwordHash');
  if (!user) throw new AppError('Worker not found', 404);

  const profile = await WorkerProfile.findOne({ user: user._id }).populate('categories');
  return { user, profile };
}
