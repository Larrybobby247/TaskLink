import { Router } from 'express';
import * as notificationsController from '../controllers/notifications.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, notificationsController.getNotifications);
router.post('/:id/read', requireAuth, notificationsController.markAsRead);
router.post('/read-all', requireAuth, notificationsController.markAllAsRead);

export default router;
