import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as withdrawalService from '../services/withdrawal.service.js';
import * as paystack from '../services/paystack.service.js';
import { Withdrawal } from '../models/index.js';

export const requestWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.requestWithdrawal(req.user, req.body.amountKobo);
  return created(res, { withdrawal });
});

export const addBankAccount = asyncHandler(async (req, res) => {
  const user = await withdrawalService.addBankAccount(req.user._id, req.body);
  return ok(res, {
    user: user.toSafeJSON(),
    bankDetails: user.bankDetails,
  });
});

export const listBanks = asyncHandler(async (req, res) => {
  const banks = await paystack.listBanks();
  return ok(res, { banks });
});

export const getMyWithdrawals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    Withdrawal.find({ user: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Withdrawal.countDocuments({ user: req.user._id }),
  ]);
  return paginated(res, items, { page, limit, total });
});
