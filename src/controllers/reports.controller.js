import { asyncHandler } from '../utils/asyncHandler.js';
import { created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import { Report } from '../models/index.js';

export const createReport = asyncHandler(async (req, res) => {
  const report = await Report.create({ ...req.body, reporter: req.user._id });
  return created(res, { report });
});

export const getMyReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    Report.find({ reporter: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Report.countDocuments({ reporter: req.user._id }),
  ]);
  return paginated(res, items, { page, limit, total });
});
