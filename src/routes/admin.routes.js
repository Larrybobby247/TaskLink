import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/dashboard', adminController.getDashboardMetrics);

router.get('/users', adminController.searchUsers);
router.get('/users/:id', adminController.getUserDetail);
router.post('/users/:id/verify', adminController.verifyUser);
router.post('/users/:id/suspend', adminController.suspendUser);
router.post('/users/:id/unsuspend', adminController.unsuspendUser);
router.post('/users/:id/deactivate', adminController.deactivateUser);

router.get('/tasks', adminController.adminSearchTasks);
router.post('/tasks/:id/flag', adminController.flagTask);
router.post('/tasks/:id/pause', adminController.adminPauseTask);
router.delete('/tasks/:id', adminController.adminDeleteTask);

router.get('/payments', adminController.listPayments);
router.get('/withdrawals', adminController.listWithdrawals);
router.post('/withdrawals/:id/approve', adminController.approveWithdrawal);
router.post('/withdrawals/:id/reject', adminController.rejectWithdrawal);
router.post('/balance-adjustments', adminController.createBalanceAdjustment);

router.get('/disputes', adminController.listDisputes);
router.get('/disputes/:id', adminController.getDispute);
router.post('/disputes/:id/notes', adminController.addDisputeNote);
router.post('/disputes/:id/resolve', adminController.resolveDispute);

router.get('/reports', adminController.listReports);
router.post('/reports/:id/action', adminController.actionReport);

router.get('/settings', adminController.getSettings);
router.patch('/settings', adminController.updateSettings);

router.get('/action-logs', adminController.getActionLogs);

export default router;
