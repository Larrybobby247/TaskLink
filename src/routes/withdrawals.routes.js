import { Router } from 'express';
import * as withdrawalsController from '../controllers/withdrawals.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { requestWithdrawalSchema, addBankAccountSchema } from '../validators/withdrawal.validators.js';

const router = Router();

router.get('/banks', requireAuth, withdrawalsController.listBanks);
router.post('/bank-account', requireAuth, validate(addBankAccountSchema), withdrawalsController.addBankAccount);
router.post('/', requireAuth, validate(requestWithdrawalSchema), withdrawalsController.requestWithdrawal);
router.get('/mine', requireAuth, withdrawalsController.getMyWithdrawals);

export default router;
