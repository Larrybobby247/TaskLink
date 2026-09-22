import { Router } from 'express';
import * as reviewsController from '../controllers/reviews.controller.js';

const router = Router();

router.get('/user/:userId', reviewsController.getUserReviews);

export default router;
