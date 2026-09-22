import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as workerService from '../services/worker.service.js';

export const searchWorkers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await workerService.searchWorkers({ ...req.query, page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

export const getWorkerProfile = asyncHandler(async (req, res) => {
  const result = await workerService.getWorkerPublicProfile(req.params.id);
  return ok(res, { user: result.user.toSafeJSON(), workerProfile: result.profile });
});
