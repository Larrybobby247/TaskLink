import express from 'express';
import { createReview, getOrderReview } from '../controllers/reviewController.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/orders/:orderId/review', auth, createReview);
router.get('/reviews/order/:orderId', auth, getOrderReview);

export default router;
