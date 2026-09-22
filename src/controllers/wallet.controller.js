import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import { getWalletBalanceKobo, getTransactionHistory } from '../services/wallet.service.js';

export const getWallet = asyncHandler(async (req, res) => {
  const balanceKobo = await getWalletBalanceKobo(req.user._id);
  return ok(res, { balanceKobo });
});

export const getWalletTransactions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await getTransactionHistory(req.user._id, { page, limit, skip, type: req.query.type });
  return paginated(res, items, { page, limit, total });
});
