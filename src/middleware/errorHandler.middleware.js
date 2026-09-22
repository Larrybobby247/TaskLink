import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const statusCode = err instanceof AppError ? err.statusCode : err.statusCode || 500;
  const message = err.isOperational ? err.message : isProd ? 'Something went wrong' : err.message;

  if (statusCode >= 500) {
    logger.error(err.stack || err.message);
  }

  const body = { success: false, message };
  if (err.errors) body.errors = err.errors;
  if (!isProd && statusCode >= 500) body.stack = err.stack;

  res.status(statusCode).json(body);
}
