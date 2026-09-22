import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './src/app.js';
import { connectDB } from './src/config/db.js';
import { env } from './src/config/env.js';
import { logger } from './src/utils/logger.js';
import { startScheduledJobs } from './src/jobs/index.js';
import { initChatSocket } from './src/sockets/chat.socket.js';

async function main() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: { origin: env.clientUrl, credentials: true },
  });
  initChatSocket(io);
  app.set('io', io);

  startScheduledJobs();

  server.listen(env.port, () => {
    logger.info(`TaskLink API listening on port ${env.port} [${env.nodeEnv}]`);
  });

  process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled rejection: ${err.message}`);
  });
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
