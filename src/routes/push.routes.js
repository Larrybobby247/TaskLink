import { Router } from 'express';
import * as pushController from '../controllers/push.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Public: the frontend needs this before a user is necessarily "logged in"
// in a way that matters here - it's just a public key, not sensitive.
router.get('/vapid-public-key', pushController.getVapidPublicKey);
router.post('/subscribe', requireAuth, pushController.subscribe);
router.post('/unsubscribe', requireAuth, pushController.unsubscribe);

export default router;
