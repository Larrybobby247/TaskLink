import { Router } from 'express';

import * as paymentsController from '../controllers/payments.controller.js';

import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/initialize', requireAuth, paymentsController.initializePayment);

// Payment verification is public because the backend verifies
// the reference directly with Paystack.
router.post('/verify', paymentsController.verifyPayment);

export default router;