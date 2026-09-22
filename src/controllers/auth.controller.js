import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok, created } from '../utils/apiResponse.js';
import { User, VerificationCode, PasswordResetToken } from '../models/index.js';
import { hashPassword, comparePassword, signToken, setAuthCookie, clearAuthCookie } from '../services/auth.service.js';
import { generateNumericCode, generateSecureToken, hashValue, compareValue } from '../utils/crypto.js';
import { emailService } from '../services/email.service.js';
import { env } from '../config/env.js';

const CODE_EXPIRY_MS = 15 * 60 * 1000;
const RESET_EXPIRY_MS = 60 * 60 * 1000;

async function issueVerificationCode(user) {
  const code = generateNumericCode(6);
  const codeHash = await hashValue(code);
  await VerificationCode.deleteMany({ user: user._id, purpose: 'EMAIL_VERIFICATION' });
  await VerificationCode.create({
    user: user._id,
    purpose: 'EMAIL_VERIFICATION',
    codeHash,
    expiresAt: new Date(Date.now() + CODE_EXPIRY_MS),
  });
  console.log('VERIFICATION CODE:', code);
  console.log('USER EMAIL:', user.email); 
  await emailService.sendVerificationEmail(user, code);
}

export const register = asyncHandler(async (req, res) => {
  const { fullName, username, email, phone, password, referralCode } = req.body;

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    throw new AppError(existing.email === email ? 'An account with this email already exists' : 'This username is taken', 400);
  }

  let referredBy;
  if (referralCode) {
    const referrer = await User.findOne({ referralCode });
    if (referrer) referredBy = referrer._id;
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    fullName, username, email, phone, passwordHash, referredBy,
    referralCode: generateSecureToken(4),
  });

  await issueVerificationCode(user);
  emailService.sendWelcome(user);

  return created(res, { userId: user._id, email: user.email, message: 'Verification code sent to your email' });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;
  const user = await User.findOne({ email });
  if (!user) throw new AppError('Invalid verification request', 400);
  if (user.emailVerified) return ok(res, { message: 'Email already verified' });

  const record = await VerificationCode.findOne({ user: user._id, purpose: 'EMAIL_VERIFICATION' }).select('+codeHash').sort({ createdAt: -1 });
  if (!record) throw new AppError('No verification code found. Please request a new one.', 400);
  if (record.consumedAt) throw new AppError('This code has already been used', 400);
  if (record.expiresAt < new Date()) throw new AppError('Code expired. Request a new code.', 400);
  if (record.attempts >= record.maxAttempts) throw new AppError('Too many incorrect attempts. Request a new code.', 429);

  const isValid = await compareValue(code, record.codeHash);
  if (!isValid) {
    record.attempts += 1;
    await record.save();
    throw new AppError('Incorrect code', 400);
  }

  record.consumedAt = new Date();
  await record.save();

  user.emailVerified = true;
  await user.save();

  const token = signToken(user._id);
  setAuthCookie(res, token);

  return ok(res, { user: user.toSafeJSON(), token });
});

export const resendCode = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  // Don't reveal whether the account exists.
  if (!user || user.emailVerified) return ok(res, { message: 'If an account exists, a new code has been sent.' });

  const recent = await VerificationCode.findOne({ user: user._id, purpose: 'EMAIL_VERIFICATION' }).sort({ createdAt: -1 });
  if (recent && Date.now() - recent.lastSentAt.getTime() < 60_000) {
    throw new AppError('Please wait before requesting another code', 429);
  }

  await issueVerificationCode(user);
  return ok(res, { message: 'If an account exists, a new code has been sent.' });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash');

  // Same generic error whether the email doesn't exist or the password is wrong.
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw new AppError('Invalid email or password', 401);
  }
  if (user.accountStatus === 'SUSPENDED') throw new AppError('Your account has been suspended. Contact support.', 403);
  if (user.accountStatus === 'DEACTIVATED') throw new AppError('This account has been deactivated', 403);

  user.lastLoginAt = new Date();
  await user.save();

  const token = signToken(user._id);
  setAuthCookie(res, token);

  return ok(res, { user: user.toSafeJSON(), token, emailVerified: user.emailVerified });
});

export const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  return ok(res, { message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  return ok(res, { user: req.user.toSafeJSON() });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    const token = generateSecureToken(32);
    const tokenHash = await hashValue(token);
    await PasswordResetToken.deleteMany({ user: user._id });
    await PasswordResetToken.create({ user: user._id, tokenHash, expiresAt: new Date(Date.now() + RESET_EXPIRY_MS) });
    const resetUrl = `${env.clientUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    await emailService.sendPasswordResetEmail(user, resetUrl);
  }
  // Never reveal whether the email exists.
  return ok(res, { message: 'If an account exists for this email, a reset link has been sent.' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  const email = req.query.email || req.body.email;
  const user = await User.findOne({ email });
  if (!user) throw new AppError('Invalid or expired reset link', 400);

  const record = await PasswordResetToken.findOne({ user: user._id }).select('+tokenHash').sort({ createdAt: -1 });
  if (!record || record.consumedAt || record.expiresAt < new Date()) {
    throw new AppError('Invalid or expired reset link', 400);
  }

  const isValid = await compareValue(token, record.tokenHash);
  if (!isValid) throw new AppError('Invalid or expired reset link', 400);

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  record.consumedAt = new Date();
  await record.save();

  emailService.sendSecurityAlert(user, 'Your password was just changed. If this was not you, contact support immediately.');

  return ok(res, { message: 'Password reset successful. You can now log in.' });
});
