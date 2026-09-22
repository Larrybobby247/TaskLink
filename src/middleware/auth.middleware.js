import { verifyToken } from '../services/auth.service.js';
import { User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

function extractToken(req) {
  return req.cookies?.[env.jwtCookieName] || req.headers.authorization?.replace('Bearer ', '');
}

/** Populates req.user from a verified JWT. Never trust a user id from req.body/query instead. */
export async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new AppError('Authentication required', 401);

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub);
    if (!user) throw new AppError('Account no longer exists', 401);
    if (user.accountStatus === 'SUSPENDED') throw new AppError('Your account has been suspended', 403);
    if (user.accountStatus === 'DEACTIVATED') throw new AppError('Your account has been deactivated', 403);

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Invalid or expired session', 401));
  }
}

export async function attachUserIfPresent(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return next();
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub);
    if (user && user.accountStatus === 'ACTIVE') req.user = user;
    next();
  } catch {
    next();
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') return next(new AppError('Admin access required', 403));
  next();
}

export function requireVerifiedEmail(req, res, next) {
  if (!req.user?.emailVerified) return next(new AppError('Please verify your email address to continue', 403));
  next();
}
