import { Router } from 'express';
import * as messagesController from '../controllers/messages.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { sendMessageSchema } from '../validators/message.validators.js';

const router = Router();

router.get('/conversations', requireAuth, messagesController.listConversations);
router.post('/conversations', requireAuth, messagesController.startConversation);
router.post('/conversations/:conversationId/read', requireAuth, messagesController.markConversationRead);
router.get('/conversations/:conversationId/messages', requireAuth, messagesController.getMessages);
router.post('/conversations/:conversationId/messages', requireAuth, validate(sendMessageSchema), messagesController.sendMessage);

export default router;
