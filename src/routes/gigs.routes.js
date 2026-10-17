import { Router } from 'express';
import mongoose from 'mongoose';
import * as gigsController from '../controllers/gigs.controller.js';
import { requireAuth, requireVerifiedEmail, attachUserIfPresent } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { uploadImages } from '../middleware/upload.middleware.js';
import { AppError } from '../utils/AppError.js';
import { createGigSchema, updateGigSchema, orderGigSchema, searchGigsQuerySchema } from '../validators/gig.validators.js';

const router = Router();

// Any malformed :id is a plain "not found" instead of a 500 CastError.
router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return next(new AppError('Gig not found', 404));
  next();
});

// --- Public browsing ---
router.get('/', validate(searchGigsQuerySchema, 'query'), gigsController.searchGigs);
router.get('/featured', gigsController.getFeaturedGigs);

// --- Worker management (plan limits enforced server-side in gig.service.js#publishGig) ---
// Static "/mine/*" and "/featured" routes are registered BEFORE "/:id" so they can never be shadowed by it.
router.get('/mine/list', requireAuth, gigsController.getMyGigs);
router.get('/mine/limit', requireAuth, gigsController.getMyGigLimit);

// attachUserIfPresent lets the owner (and admins) open their own draft/paused gig for editing/preview;
// everyone else only ever gets published gigs.
router.get('/:id', attachUserIfPresent, gigsController.getGig);

router.post('/', requireAuth, requireVerifiedEmail, validate(createGigSchema), gigsController.createGig);
router.patch('/:id', requireAuth, validate(updateGigSchema), gigsController.updateGig);
router.post('/:id/publish', requireAuth, gigsController.publishGig);
router.post('/:id/pause', requireAuth, gigsController.pauseGig);
router.delete('/:id', requireAuth, gigsController.deleteGig);

router.post('/:id/images', requireAuth, uploadImages('images', 5), gigsController.uploadGigImages);
router.post('/:id/cover-image', requireAuth, gigsController.setCoverImage);
router.delete('/:id/images/:publicId', requireAuth, gigsController.deleteGigImage);

// --- Ordering (client) ---
router.post('/:id/order', requireAuth, requireVerifiedEmail, validate(orderGigSchema), gigsController.orderGig);

export default router;
