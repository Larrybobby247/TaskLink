import winston from 'winston';
import fs from 'fs';
import { isProd } from '../config/env.js';

fs.mkdirSync('logs', { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) => `${ts} ${level}: ${stack || message}`)
);

const prodFormat = combine(timestamp(), errors({ stack: true }), winston.format.json());

export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: isProd ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
});

export const securityLogger = winston.createLogger({
  level: 'info',
  format: isProd ? prodFormat : devFormat,
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: 'logs/security.log' })],
});
