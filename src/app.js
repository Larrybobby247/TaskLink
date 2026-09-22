import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import morgan from 'morgan';

import { env, isProd } from './config/env.js';
import { logger } from './utils/logger.js';
import { globalLimiter } from './middleware/rateLimiter.middleware.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.middleware.js';
import paystackWebhookRouter from './webhooks/paystack.webhook.js';
import apiRoutes from './routes/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.clientUrl,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(morgan(isProd ? 'combined' : 'dev', { stream: { write: (msg) => logger.info(msg.trim()) } }));

  // IMPORTANT: the Paystack webhook needs the raw request body to verify its
  // signature, so it is mounted here BEFORE express.json() parses the body.
  app.use('/api/payments', paystackWebhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(mongoSanitize());
  app.use(globalLimiter);

  app.get('/health', (req, res) => res.json({ status: 'ok', env: env.nodeEnv }));

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
