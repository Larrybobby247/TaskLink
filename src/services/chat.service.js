import { Conversation, Message, Application, Order } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';
import { User } from '../models/index.js';

// Very small heuristic filter to discourage obvious off-platform payment/contact
// bypass attempts, per spec section 74. Intentionally conservative - it flags
// messages for review rather than blocking them outright, to avoid making chat unusable.
const BYPASS_PATTERNS = [
  /\b\d{11}\b/, // looks like a raw Nigerian phone number
  /\b(whatsapp|telegram|call me on|reach me on)\b/i,
  /\b(bank transfer|send money to|opay|palmpay)\b.*\b(acct|account|\d{10})\b/i,
];

function detectBypassAttempt(text = '') {
  return BYPASS_PATTERNS.some((re) => re.test(text));
}

/**
 * Chat is only permitted between an established client/worker relationship -
 * i.e. an application on a task, or the resulting order. Fully open DMs are
 * intentionally not supported.
 */
export async function getOrCreateConversationForApplication(applicationId, requestingUserId) {
  const application = await Application.findById(applicationId).populate('task');
  if (!application) throw new AppError('Application not found', 404);

  const clientId = application.task.client;
  const workerId = application.worker;
  const uid = String(requestingUserId);
  if (String(clientId) !== uid && String(workerId) !== uid) {
    throw new AppError('You are not part of this conversation', 403);
  }

  let conversation = await Conversation.findOne({ application: applicationId });
  if (!conversation) {
    conversation = await Conversation.create({
      participants: [clientId, workerId],
      task: application.task._id,
      application: applicationId,
    });
  }
  return conversation;
}

export async function listConversations(userId, { page, limit, skip }) {
  const filter = { participants: userId };
  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('participants', 'fullName username profileImage'),
    Conversation.countDocuments(filter),
  ]);
  return { items, total };
}

export async function sendMessage(senderId, conversationId, { text, attachment }) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  if (!conversation.participants.some((p) => String(p) === String(senderId))) {
    throw new AppError('You are not part of this conversation', 403);
  }
  if (conversation.isBlocked) throw new AppError('This conversation has been blocked', 403);

  const flaggedForBypass = detectBypassAttempt(text);

  const message = await Message.create({
    conversation: conversationId,
    sender: senderId,
    text,
    attachment,
    readBy: [senderId],
    flaggedForBypass,
  });

  conversation.lastMessage = text?.slice(0, 200);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const recipientId = conversation.participants.find((p) => String(p) !== String(senderId));
  if (recipientId) {
    await notify({
      userId: recipientId,
      type: 'NEW_MESSAGE',
      title: 'New message',
      body: text?.slice(0, 140) || 'Sent an attachment',
      entityType: 'MESSAGE',
      entityId: message._id,
    });
    const [sender, recipient] = await Promise.all([User.findById(senderId), User.findById(recipientId)]);
    if (recipient?.notificationPreferences?.email?.messages) {
      emailService.sendNewMessageNotification(recipient, sender);
    }
  }

  return { message, flaggedForBypass };
}

export async function getMessages(userId, conversationId, { page, limit, skip }) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new AppError('Conversation not found', 404);
  if (!conversation.participants.some((p) => String(p) === String(userId))) {
    throw new AppError('You are not part of this conversation', 403);
  }

  const [items, total] = await Promise.all([
    Message.find({ conversation: conversationId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Message.countDocuments({ conversation: conversationId }),
  ]);

  await Message.updateMany(
    { conversation: conversationId, readBy: { $ne: userId } },
    { $addToSet: { readBy: userId } }
  );

  return { items: items.reverse(), total };
}
