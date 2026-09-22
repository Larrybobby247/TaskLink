import { Router } from 'express';
import * as reportsController from '../controllers/reports.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/', requireAuth, reportsController.createReport);
router.get('/mine', requireAuth, reportsController.getMyReports);

export default router;
