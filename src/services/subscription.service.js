import { Subscription, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { getPlatformSettings } from './platformSettings.service.js';
import * as paystack from './paystack.service.js';
import { generateReference } from '../utils/crypto.js';
import { Payment } from '../models/index.js';

export async function initializeProSubscription(user) {
  if (user.plan === 'PRO' && user.proExpiresAt && user.proExpiresAt > new Date()) {
    throw new AppError('You already have an active Pro subscription', 400);
  }

  const settings = await getPlatformSettings();
  const reference = generateReference('SUB');

  await Subscription.create({
    user: user._id,
    plan: 'PRO',
    status: 'PENDING',
    priceKobo: settings.proMonthlyPriceKobo,
    paymentReference: reference,
  });

  await Payment.create({
    user: user._id,
    paystackReference: reference,
    amountKobo: settings.proMonthlyPriceKobo,
    status: 'INITIALIZED',
    paymentType: 'SUBSCRIPTION',
    metadata: { userId: String(user._id) },
  });

  const paystackData = await paystack.initializeTransaction({
    email: user.email,
    amountKobo: settings.proMonthlyPriceKobo,
    reference,
    metadata: { userId: String(user._id), paymentType: 'SUBSCRIPTION' },
  });

  return { authorizationUrl: paystackData.authorization_url, reference };
}

export async function getActiveSubscription(userId) {
  return Subscription.findOne({ user: userId, status: 'ACTIVE' }).sort({ createdAt: -1 });
}

export async function cancelSubscription(userId) {
  const sub = await Subscription.findOne({ user: userId, status: 'ACTIVE' });
  if (!sub) throw new AppError('No active subscription found', 404);
  sub.status = 'CANCELLED';
  sub.autoRenew = false;
  await sub.save();
  // Plan downgrade happens at natural expiry (see jobs/expireSubscriptions.job.js)
  // so the user keeps Pro benefits through the period they already paid for.
  return sub;
}
