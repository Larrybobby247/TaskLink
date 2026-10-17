import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as workerService from '../services/worker.service.js';

export const searchWorkers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await workerService.searchWorkers({ ...req.query, page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

export const getWorkerProfile = asyncHandler(async (req, res) => {
  const result = await workerService.getWorkerPublicProfile(req.params.id);
  // toPublicJSON: allow-listed fields only. toSafeJSON() leaked email, phone and bank details here.
  return ok(res, { user: result.user.toPublicJSON(), workerProfile: result.profile });
});


// --- New: saved workers (spec §13) ---

export const saveWorker = asyncHandler(async (req, res) => {
  await workerService.saveWorker(req.user._id, req.params.id);
  return created(res, { message: 'Worker saved' });
});

export const unsaveWorker = asyncHandler(async (req, res) => {
  await workerService.unsaveWorker(req.user._id, req.params.id);
  return ok(res, { message: 'Worker removed from saved list' });
});

export const getSavedWorkers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await workerService.getSavedWorkers(req.user._id, { page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

// --- New: direct hiring (spec §13) ---

export const hireWorker = asyncHandler(async (req, res) => {
  const order = await workerService.hireWorker(req.user, req.params.id, req.body);
  return created(res, { order });
})
