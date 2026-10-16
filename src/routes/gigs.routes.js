import { Router } from 'express';
import * as gigsController from '../controllers/gigs.controller.js';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { uploadMultiple } from '../middleware/upload.middleware.js';
import { createGigSchema, updateGigSchema, orderGigSchema, searchGigsQuerySchema } from '../validators/gig.validators.js';

const router = Router();

// --- Public browsing ---
router.get('/', validate(searchGigsQuerySchema, 'query'), gigsController.searchGigs);
router.get('/featured', gigsController.getFeaturedGigs);
router.get('/:id', gigsController.getGig);

// --- Worker management (plan limits enforced server-side in gig.service.js#publishGig) ---
router.get('/mine/list', requireAuth, gigsController.getMyGigs);
router.get('/mine/limit', requireAuth, gigsController.getMyGigLimit);
router.post('/', requireAuth, requireVerifiedEmail, validate(createGigSchema), gigsController.createGig);
router.patch('/:id', requireAuth, validate(updateGigSchema), gigsController.updateGig);
router.post('/:id/publish', requireAuth, gigsController.publishGig);
router.post('/:id/pause', requireAuth, gigsController.pauseGig);
router.delete('/:id', requireAuth, gigsController.deleteGig);

router.post('/:id/images', requireAuth, uploadMultiple('images', 5), gigsController.uploadGigImages);
router.post('/:id/cover-image', requireAuth, gigsController.setCoverImage);
router.delete('/:id/images/:publicId', requireAuth, gigsController.deleteGigImage);

// --- Ordering (client) ---
router.post('/:id/order', requireAuth, requireVerifiedEmail, validate(orderGigSchema), gigsController.orderGig);

export default router;
