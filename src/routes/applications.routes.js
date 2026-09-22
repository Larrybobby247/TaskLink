import { Router } from 'express';
import * as applicationsController from '../controllers/applications.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/mine', requireAuth, applicationsController.getMyApplications);
router.post('/:id/withdraw', requireAuth, applicationsController.withdrawApplication);
router.post('/:id/shortlist', requireAuth, applicationsController.shortlistApplication);
router.post('/:id/reject', requireAuth, applicationsController.rejectApplication);

export default router;
