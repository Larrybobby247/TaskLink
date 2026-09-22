import { Router } from 'express';
import * as uploadsController from '../controllers/uploads.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadSingle } from '../middleware/upload.middleware.js';

const router = Router();

router.post('/task-attachment', requireAuth, uploadSingle('file'), uploadsController.uploadTaskAttachment);
router.post('/submission', requireAuth, uploadSingle('file'), uploadsController.uploadSubmissionFile);
router.post('/chat-attachment', requireAuth, uploadSingle('file'), uploadsController.uploadChatAttachment);

export default router;
