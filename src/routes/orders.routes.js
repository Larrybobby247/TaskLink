import { Router } from 'express';
import * as ordersController from '../controllers/orders.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireOrderParticipant } from '../middleware/ownership.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  submitWorkSchema, requestRevisionSchema, cancelOrderSchema, reviewSchema, openDisputeSchema,
} from '../validators/order.validators.js';

const router = Router();

router.post('/select-worker', requireAuth, ordersController.selectWorker);
router.get('/client', requireAuth, ordersController.getMyOrdersAsClient);
router.get('/worker', requireAuth, ordersController.getMyOrdersAsWorker);
router.get('/:id', requireAuth, requireOrderParticipant, ordersController.getOrder);

router.post('/:id/submit', requireAuth, requireOrderParticipant, validate(submitWorkSchema), ordersController.submitWork);
router.post('/:id/revision', requireAuth, requireOrderParticipant, validate(requestRevisionSchema), ordersController.requestRevision);
router.post('/:id/approve', requireAuth, requireOrderParticipant, ordersController.approveOrder);
router.post('/:id/cancel', requireAuth, requireOrderParticipant, validate(cancelOrderSchema), ordersController.cancelOrder);
router.post('/:id/review', requireAuth, requireOrderParticipant, validate(reviewSchema), ordersController.leaveReview);
router.post('/:id/dispute', requireAuth, requireOrderParticipant, validate(openDisputeSchema), ordersController.openDispute);

export default router;
