import { Router } from 'express';
import {
  getUserReviews,
  getOrderReview,
  createReview,
} from '../controllers/reviews.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/user/:userId', requireAuth, getUserReviews);
router.get('/order/:orderId', requireAuth, getOrderReview);
router.post('/order/:orderId/review', requireAuth, createReview);

export default router;
