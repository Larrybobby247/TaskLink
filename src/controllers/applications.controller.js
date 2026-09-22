import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as applicationService from '../services/application.service.js';
import { Application } from '../models/index.js';

export const applyToTask = asyncHandler(async (req, res) => {
  const application = await applicationService.applyToTask(req.user, req.params.taskId, req.body);
  return created(res, { application });
});

export const withdrawApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.withdrawApplication(req.user._id, req.params.id);
  return ok(res, { application });
});

export const listApplicationsForTask = asyncHandler(async (req, res) => {
  const applications = await applicationService.listApplicationsForTask(req.user._id, req.params.taskId, req.query);
  return ok(res, { applications });
});

export const shortlistApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.shortlistApplication(req.user._id, req.params.id);
  return ok(res, { application });
});

export const rejectApplication = asyncHandler(async (req, res) => {
  const application = await applicationService.rejectApplication(req.user._id, req.params.id);
  return ok(res, { application });
});

export const getMyApplications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { worker: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate({ path: 'task', populate: 'category' }),
    Application.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});
