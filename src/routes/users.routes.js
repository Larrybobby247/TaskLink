import { Router } from 'express';
import * as usersController from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { uploadSingle } from '../middleware/upload.middleware.js';
import { updateProfileSchema, updateWorkerProfileSchema, switchModeSchema } from '../validators/profile.validators.js';

const router = Router();

router.get('/profile/:id', usersController.getPublicProfile);
router.patch('/profile', requireAuth, validate(updateProfileSchema), usersController.updateProfile);
router.post('/profile/image', requireAuth, uploadSingle('image'), usersController.uploadProfileImage);
router.post('/mode', requireAuth, validate(switchModeSchema), usersController.switchMode);
router.patch('/notifications-preferences', requireAuth, usersController.updateNotificationPreferences);

router.get('/worker-profile/me', requireAuth, usersController.getMyWorkerProfile);
router.patch('/worker-profile/me', requireAuth, validate(updateWorkerProfileSchema), usersController.updateWorkerProfile);
router.post('/worker-profile/portfolio', requireAuth, uploadSingle('image'), usersController.addPortfolioItem);

export default router;
