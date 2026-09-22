import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export function generateNumericCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max));
}
export function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}
export async function hashValue(value) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(value, salt);
}
export async function compareValue(value, hash) {
  return bcrypt.compare(value, hash);
}
export function generateReference(prefix = 'TL') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}
