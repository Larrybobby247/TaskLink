import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

// eslint-disable-next-line no-unused-vars
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'That file is too large.',
  LIMIT_FILE_COUNT: 'Too many files were uploaded.',
  LIMIT_UNEXPECTED_FILE: 'Too many files, or an unexpected upload field.',
};

export function errorHandler(err, req, res, next) {
  // Upload errors from multer and malformed ids are the client's mistake, not a 500.
  if (err?.name === 'MulterError') {
    err = new AppError(MULTER_MESSAGES[err.code] || 'Upload failed', 400);
  } else if (err?.name === 'CastError') {
    err = new AppError('Invalid id or value in request', 400);
  }

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
