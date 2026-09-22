import { Router } from 'express';
import * as subscriptionsController from '../controllers/subscriptions.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/initialize', requireAuth, subscriptionsController.initializeSubscription);
router.get('/mine', requireAuth, subscriptionsController.getMySubscription);
router.post('/cancel', requireAuth, subscriptionsController.cancelSubscription);

export default router;
