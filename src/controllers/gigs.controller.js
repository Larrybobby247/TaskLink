import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as gigService from '../services/gig.service.js';
import { getGigLimitAndUsage } from '../services/planLimits.service.js';
import { uploadBuffer, deleteAsset } from '../services/upload.service.js';
import { Gig } from '../models/index.js';

export const createGig = asyncHandler(async (req, res) => {
  const gig = await gigService.createGig(req.user, req.body);
  return created(res, { gig });
});

export const updateGig = asyncHandler(async (req, res) => {
  const gig = await gigService.updateGig(req.user, req.params.id, req.body);
  return ok(res, { gig });
});

export const publishGig = asyncHandler(async (req, res) => {
  const gig = await gigService.publishGig(req.user, req.params.id);
  return ok(res, { gig });
});

export const pauseGig = asyncHandler(async (req, res) => {
  const gig = await gigService.pauseGig(req.user, req.params.id);
  return ok(res, { gig });
});

export const deleteGig = asyncHandler(async (req, res) => {
  const result = await gigService.deleteGig(req.user, req.params.id);
  return ok(res, result);
});

export const getGig = asyncHandler(async (req, res) => {
  const gig = await gigService.getGigById(req.params.id);
  gigService.incrementGigView(gig._id).catch(() => {});
  return ok(res, { gig });
});

export const getMyGigs = asyncHandler(async (req, res) => {
  const gigs = await gigService.getMyGigs(req.user._id, { status: req.query.status });
  return ok(res, { gigs });
});

export const getMyGigLimit = asyncHandler(async (req, res) => {
  const usage = await getGigLimitAndUsage(req.user);
  return ok(res, usage);
});

export const searchGigs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await gigService.searchGigs({ ...req.query, page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

export const getFeaturedGigs = asyncHandler(async (req, res) => {
  const limit = Math.min(12, Number(req.query.limit) || 6);
  const gigs = await gigService.getFeaturedGigs(limit);
  return ok(res, { gigs });
});

export const uploadGigImages = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw new AppError('No files provided', 400);

  const gig = await Gig.findById(req.params.id);
  if (!gig) throw new AppError('Gig not found', 404);
  if (String(gig.worker) !== String(req.user._id)) throw new AppError('You do not own this gig', 403);

  const { getPlatformSettings } = await import('../services/platformSettings.service.js');
  const settings = await getPlatformSettings();
  if (gig.images.length + req.files.length > settings.maxGigImages) {
    throw new AppError(`A gig can have at most ${settings.maxGigImages} images`, 400);
  }

  const uploaded = await Promise.all(
    req.files.map((file) => uploadBuffer(file.buffer, { folder: 'gig-images', resourceType: 'image' }))
  );
  const images = uploaded.map((r) => ({ url: r.secure_url, publicId: r.public_id }));

  gig.images.push(...images);
  if (!gig.coverImage?.url) gig.coverImage = images[0];
  await gig.save();

  return created(res, { gig });
});

export const setCoverImage = asyncHandler(async (req, res) => {
  const { publicId } = req.body;
  const gig = await Gig.findById(req.params.id);
  if (!gig) throw new AppError('Gig not found', 404);
  if (String(gig.worker) !== String(req.user._id)) throw new AppError('You do not own this gig', 403);

  const match = gig.images.find((img) => img.publicId === publicId);
  if (!match) throw new AppError('That image is not part of this gig', 400);

  gig.coverImage = match;
  await gig.save();
  return ok(res, { gig });
});

export const deleteGigImage = asyncHandler(async (req, res) => {
  const { publicId } = req.params;
  const gig = await Gig.findById(req.params.id);
  if (!gig) throw new AppError('Gig not found', 404);
  if (String(gig.worker) !== String(req.user._id)) throw new AppError('You do not own this gig', 403);

  gig.images = gig.images.filter((img) => img.publicId !== publicId);
  if (gig.coverImage?.publicId === publicId) gig.coverImage = gig.images[0] || undefined;
  await gig.save();
  await deleteAsset(publicId).catch(() => {});

  return ok(res, { gig });
});

export const orderGig = asyncHandler(async (req, res) => {
  const order = await gigService.orderGig(req.user, req.params.id, req.body);
  return created(res, { order });
});
