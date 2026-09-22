import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import {
  User, Task, Order, Payment, Withdrawal, Subscription, Dispute, Report, AdminActionLog,
} from '../models/index.js';
import * as disputeService from '../services/dispute.service.js';
import * as withdrawalService from '../services/withdrawal.service.js';
import * as walletService from '../services/wallet.service.js';
import { getPlatformSettings, invalidatePlatformSettingsCache } from '../services/platformSettings.service.js';
import { PlatformSetting } from '../models/index.js';

async function logAdminAction(req, action, targetType, targetId, details = {}) {
  await AdminActionLog.create({ admin: req.user._id, action, targetType, targetId, details, ipAddress: req.ip });
}

export const getDashboardMetrics = asyncHandler(async (req, res) => {
  const [
    totalUsers, newUsersLast30d, totalTasks, activeTasks, completedTasks, cancelledTasks, disputedOrders,
    pendingWithdrawals, pendingDisputes, proSubscriptions, revenueAgg,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    Task.countDocuments(),
    Task.countDocuments({ status: { $in: ['PUBLISHED', 'APPLICATIONS_OPEN', 'WORKER_SELECTED', 'IN_PROGRESS'] } }),
    Task.countDocuments({ status: 'COMPLETED' }),
    Task.countDocuments({ status: 'CANCELLED' }),
    Order.countDocuments({ status: 'DISPUTED' }),
    Withdrawal.countDocuments({ status: 'PENDING' }),
    Dispute.countDocuments({ status: { $in: ['OPEN', 'UNDER_REVIEW'] } }),
    Subscription.countDocuments({ status: 'ACTIVE' }),
    Payment.aggregate([{ $match: { status: 'SUCCESS' } }, { $group: { _id: null, totalVolume: { $sum: '$amountKobo' }, totalFees: { $sum: '$platformFeeKobo' } } }]),
  ]);

  return ok(res, {
    totalUsers,
    newUsersLast30d,
    totalTasks,
    activeTasks,
    completedTasks,
    cancelledTasks,
    disputedOrders,
    pendingWithdrawals,
    pendingDisputes,
    proSubscriptions,
    totalTransactionVolumeKobo: revenueAgg[0]?.totalVolume || 0,
    platformRevenueKobo: revenueAgg[0]?.totalFees || 0,
  });
});

// --- Users ---
export const searchUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.q) filter.$text = { $search: req.query.q };
  if (req.query.status) filter.accountStatus = req.query.status;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const getUserDetail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  const [tasks, ordersAsClient, ordersAsWorker, balanceKobo] = await Promise.all([
    Task.find({ client: user._id }).sort({ createdAt: -1 }).limit(20),
    Order.find({ client: user._id }).sort({ createdAt: -1 }).limit(20),
    Order.find({ worker: user._id }).sort({ createdAt: -1 }).limit(20),
    walletService.getWalletBalanceKobo(user._id),
  ]);
  return ok(res, { user: user.toSafeJSON(), tasks, ordersAsClient, ordersAsWorker, balanceKobo });
});

export const verifyUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { identityVerified: true }, { new: true });
  await logAdminAction(req, 'VERIFY_USER', 'User', user._id);
  return ok(res, { user: user.toSafeJSON() });
});

export const suspendUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: 'SUSPENDED' }, { new: true });
  await logAdminAction(req, 'SUSPEND_USER', 'User', user._id, { reason: req.body.reason });
  return ok(res, { user: user.toSafeJSON() });
});

export const unsuspendUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: 'ACTIVE' }, { new: true });
  await logAdminAction(req, 'UNSUSPEND_USER', 'User', user._id);
  return ok(res, { user: user.toSafeJSON() });
});

export const deactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: 'DEACTIVATED' }, { new: true });
  await logAdminAction(req, 'DEACTIVATE_USER', 'User', user._id);
  return ok(res, { user: user.toSafeJSON() });
});

// --- Tasks ---
export const adminSearchTasks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.q) filter.$text = { $search: req.query.q };
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Task.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('client', 'fullName username'),
    Task.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const flagTask = asyncHandler(async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, { isFlagged: true, flagReason: req.body.reason }, { new: true });
  await logAdminAction(req, 'FLAG_TASK', 'Task', task._id, { reason: req.body.reason });
  return ok(res, { task });
});

export const adminPauseTask = asyncHandler(async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, { status: 'PAUSED' }, { new: true });
  await logAdminAction(req, 'PAUSE_TASK', 'Task', task._id);
  return ok(res, { task });
});

export const adminDeleteTask = asyncHandler(async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  await logAdminAction(req, 'DELETE_TASK', 'Task', req.params.id);
  return ok(res, { message: 'Task deleted' });
});

// --- Payments / Withdrawals ---
export const listPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'fullName username email'),
    Payment.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const listWithdrawals = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Withdrawal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'fullName username email'),
    Withdrawal.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const approveWithdrawal = asyncHandler(async (req, res) => {
  // In production this triggers services/paystack.service.js#initiateTransfer and
  // only calls markWithdrawalSuccess once Paystack confirms - left as an explicit
  // admin-gated action rather than fully automatic, per the spec's compliance note.
  const withdrawal = await withdrawalService.markWithdrawalSuccess(req.params.id, req.body.paystackTransferCode || 'MANUAL');
  await logAdminAction(req, 'APPROVE_WITHDRAWAL', 'Withdrawal', withdrawal._id);
  return ok(res, { withdrawal });
});

export const rejectWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.markWithdrawalFailed(req.params.id, req.body.reason);
  await logAdminAction(req, 'REJECT_WITHDRAWAL', 'Withdrawal', withdrawal._id, { reason: req.body.reason });
  return ok(res, { withdrawal });
});

/**
 * Explicit, audited balance adjustment. This is the ONLY way an admin can affect
 * a user's balance - it always creates a normal ledger entry (never a hidden
 * direct field edit) with a reason, admin id, and timestamp attached.
 */
export const createBalanceAdjustment = asyncHandler(async (req, res) => {
  const { userId, amountKobo, reason } = req.body;
  if (!userId || !Number.isInteger(amountKobo) || !reason) {
    throw new AppError('userId, integer amountKobo, and reason are required', 400);
  }
  const entry = await walletService.appendLedgerEntry({
    userId,
    type: 'ADJUSTMENT',
    amountKobo,
    description: `Admin adjustment: ${reason}`,
    createdByAdmin: req.user._id,
    adjustmentReason: reason,
  });
  await logAdminAction(req, 'BALANCE_ADJUSTMENT', 'User', userId, { amountKobo, reason });
  return ok(res, { transaction: entry });
});

// --- Disputes ---
export const listDisputes = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Dispute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('order').populate('openedBy', 'fullName username'),
    Dispute.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const getDispute = asyncHandler(async (req, res) => {
  const dispute = await Dispute.findById(req.params.id).populate({ path: 'order', populate: 'task client worker' });
  if (!dispute) throw new AppError('Dispute not found', 404);
  return ok(res, { dispute });
});

export const addDisputeNote = asyncHandler(async (req, res) => {
  const dispute = await disputeService.addAdminNote(req.user._id, req.params.id, req.body.note);
  return ok(res, { dispute });
});

export const resolveDispute = asyncHandler(async (req, res) => {
  const dispute = await disputeService.resolveDispute(req.user._id, req.params.id, req.body);
  await logAdminAction(req, 'RESOLVE_DISPUTE', 'Dispute', dispute._id, req.body);
  return ok(res, { dispute });
});

// --- Reports ---
export const listReports = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const [items, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('reporter', 'fullName username'),
    Report.countDocuments(filter),
  ]);
  return paginated(res, items, { page, limit, total });
});

export const actionReport = asyncHandler(async (req, res) => {
  const report = await Report.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, adminNote: req.body.adminNote, reviewedBy: req.user._id, reviewedAt: new Date() },
    { new: true }
  );
  await logAdminAction(req, 'ACTION_REPORT', 'Report', report._id, { status: req.body.status });
  return ok(res, { report });
});

// --- Platform settings ---
export const getSettings = asyncHandler(async (req, res) => {
  const settings = await getPlatformSettings();
  return ok(res, { settings });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await PlatformSetting.findOneAndUpdate(
    { key: 'GLOBAL' },
    { ...req.body, updatedBy: req.user._id },
    { new: true, upsert: true }
  );
  invalidatePlatformSettingsCache();
  await logAdminAction(req, 'UPDATE_SETTINGS', 'PlatformSetting', settings._id, req.body);
  return ok(res, { settings });
});

export const getActionLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const [items, total] = await Promise.all([
    AdminActionLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('admin', 'fullName username'),
    AdminActionLog.countDocuments(),
  ]);
  return paginated(res, items, { page, limit, total });
});
