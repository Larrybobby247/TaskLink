import { verifyToken } from '../services/auth.service.js';
import { User, Conversation } from '../models/index.js';
import { logger } from '../utils/logger.js';

/**
 * Minimal Socket.IO gateway for real-time message delivery. The REST endpoints
 * in routes/messages.routes.js remain the source of truth (persistence,
 * pagination, validation) - this layer only pushes already-persisted messages
 * to connected participants and relays typing indicators.
 */
export function initChatSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.sub);
      if (!user) return next(new Error('Account not found'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid or expired session'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user._id}`);

    socket.on('conversation:join', async (conversationId) => {
      const conversation = await Conversation.findById(conversationId);
      if (conversation && conversation.participants.some((p) => String(p) === String(socket.user._id))) {
        socket.join(`conversation:${conversationId}`);
      }
    });

    socket.on('typing', ({ conversationId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit('typing', { userId: socket.user._id, isTyping });
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.user._id}`);
    });
  });
}

/** Called by chat.service.js after persisting a message, to push it live. */
export function emitNewMessage(io, conversationId, message) {
  io.to(`conversation:${conversationId}`).emit('message:new', message);
}
