import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/apiResponse.js';
import { User } from '../models/index.js';
import * as workerService from '../services/worker.service.js';
import { uploadBuffer } from '../services/upload.service.js';

export const updateProfile = asyncHandler(async (req, res) => {
  const updated = await User.findByIdAndUpdate(req.user._id, req.body, { new: true, runValidators: true });
  return ok(res, { user: updated.toSafeJSON() });
});

export const getPublicProfile = asyncHandler(async (req, res) => {
  const identifier = req.params.id;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
  const user = await User.findOne(isObjectId ? { _id: identifier } : { username: identifier });
  if (!user) throw new AppError('User not found', 404);

  const profile = await workerService.getOrCreateWorkerProfile(user._id).catch(() => null);
  return ok(res, { user: user.toSafeJSON(), workerProfile: profile });
});

export const switchMode = asyncHandler(async (req, res) => {
  const { mode } = req.body;
  const user = await User.findByIdAndUpdate(req.user._id, { currentMode: mode }, { new: true });
  return ok(res, { user: user.toSafeJSON() });
});

export const uploadProfileImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file provided', 400);
  const result = await uploadBuffer(req.file.buffer, { folder: 'profile-images', resourceType: 'image' });
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { profileImage: { url: result.secure_url, publicId: result.public_id } },
    { new: true }
  );
  return ok(res, { user: user.toSafeJSON() });
});

export const getMyWorkerProfile = asyncHandler(async (req, res) => {
  const profile = await workerService.getOrCreateWorkerProfile(req.user._id);
  return ok(res, { workerProfile: profile });
});

export const updateWorkerProfile = asyncHandler(async (req, res) => {
  const profile = await workerService.updateWorkerProfile(req.user._id, req.body);
  return ok(res, { workerProfile: profile });
});

export const addPortfolioItem = asyncHandler(async (req, res) => {
  const { WorkerProfile } = await import('../models/index.js');
  let imagePayload = {};
  if (req.file) {
    const result = await uploadBuffer(req.file.buffer, { folder: 'portfolio', resourceType: 'image' });
    imagePayload = { image: { url: result.secure_url, publicId: result.public_id } };
  }
  const profile = await WorkerProfile.findOneAndUpdate(
    { user: req.user._id },
    { $push: { portfolio: { title: req.body.title, description: req.body.description, link: req.body.link, ...imagePayload } } },
    { upsert: true, new: true }
  );
  return ok(res, { workerProfile: profile });
});

export const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { 'notificationPreferences.email': req.body } },
    { new: true }
  );
  return ok(res, { user: user.toSafeJSON() });
});
