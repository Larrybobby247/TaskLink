import { Router } from 'express';
import * as reviewsController from '../controllers/reviews.controller.js';

const router = Router();

router.get('/user/:userId', reviewsController.getUserReviews);
router.get('/order/:orderId', reviewsController.getOrderReview);
router.post('/', reviewsController.createReview);

export default router;
