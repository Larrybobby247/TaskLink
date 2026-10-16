import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok, created, paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as chatService from '../services/chat.service.js';

export const startConversation = asyncHandler(async (req, res) => {
  const { applicationId, gigId } = req.body;

  let conversation;
  if (applicationId) {
    conversation = await chatService.getOrCreateConversationForApplication(applicationId, req.user._id);
  } else if (gigId) {
    // New (gig marketplace feature) - "Contact Worker" on a gig details
    // page, before any order/Application exists.
    conversation = await chatService.getOrCreateConversationForGig(gigId, req.user._id);
  } else {
    throw new AppError('applicationId or gigId is required', 400);
  }

  return created(res, { conversation });
});

export const listConversations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const { items, total } = await chatService.listConversations(req.user._id, { page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

export const getMessages = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query, { defaultLimit: 30, maxLimit: 100 });
  const { items, total } = await chatService.getMessages(req.user._id, req.params.conversationId, { page, limit, skip });
  return paginated(res, items, { page, limit, total });
});

export const markConversationRead = asyncHandler(async (req, res) => {
  await chatService.markConversationRead(req.user._id, req.params.conversationId);
  return ok(res, { success: true });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const result = await chatService.sendMessage(req.user._id, req.params.conversationId, req.body);
  return created(res, result);
});
