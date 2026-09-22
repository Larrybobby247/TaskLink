import mongoose from 'mongoose';
import { Payment, Order, Subscription, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import * as paystack from './paystack.service.js';
import { generateReference } from '../utils/crypto.js';
import { markOrderPaid } from './order.service.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';
import { getPlatformSettings } from './platformSettings.service.js';

/**
 * Initializes payment for an order. The amount is ALWAYS read from the Order
 * record in the database - the frontend only ever sends an orderId, never an amount.
 */
export async function initializeOrderPayment(user, orderId) {
  const order = await Order.findById(orderId).populate('task');
  if (!order) throw new AppError('Order not found', 404);
  if (String(order.client) !== String(user._id)) throw new AppError('Only the client on this order can pay for it', 403);
  if (order.paymentStatus === 'PAID') throw new AppError('This order has already been paid for', 400);
  if (!['AWAITING_PAYMENT'].includes(order.status)) {
    throw new AppError(`Order is not payable in its current status (${order.status})`, 400);
  }

  const reference = generateReference('ORDPAY');

  const payment = await Payment.create({
    user: user._id,
    task: order.task._id,
    order: order._id,
    paystackReference: reference,
    amountKobo: order.agreedAmountKobo,
    platformFeeKobo: order.platformFeeKobo,
    status: 'INITIALIZED',
    paymentType: 'ORDER_PAYMENT',
    metadata: { orderId: String(order._id) },
  });

  const paystackData = await paystack.initializeTransaction({
    email: user.email,
    amountKobo: order.agreedAmountKobo,
    reference,
    metadata: { orderId: String(order._id), userId: String(user._id), paymentType: 'ORDER_PAYMENT' },
  });

  payment.paystackAccessCode = paystackData.access_code;
  await payment.save();

  return { authorizationUrl: paystackData.authorization_url, reference, publicKey: undefined };
}

/**
 * Verifies a transaction directly with Paystack and, if genuinely successful,
 * marks the Payment + Order paid exactly once. Safe to call multiple times
 * (e.g. from both the frontend redirect AND the webhook) - idempotent by
 * checking payment.status before crediting anything.
 */
export async function verifyAndProcessPayment(reference, eventSource = 'redirect') {
  const payment = await Payment.findOne({ paystackReference: reference });
  if (!payment) throw new AppError('Payment record not found for this reference', 404);

  // Idempotency guard: if we've already processed this to a terminal state, do nothing further.
  if (payment.status === 'SUCCESS') {
    return { payment, alreadyProcessed: true };
  }

  const verified = await paystack.verifyTransaction(reference);

  if (verified.status !== 'success') {
    payment.status = 'FAILED';
    await payment.save();
    if (payment.paymentType === 'ORDER_PAYMENT') {
      const order = await Order.findById(payment.order).populate('client task');
      if (order) {
        await notify({
          userId: order.client._id,
          type: 'PAYMENT_FAILED',
          title: 'Payment failed',
          body: `Payment for "${order.task.title}" could not be confirmed`,
          entityType: 'ORDER',
          entityId: order._id,
        });
        emailService.sendPaymentFailed(order.client, order);
      }
    }
    return { payment, alreadyProcessed: false, success: false };
  }

  // Confirm the amount Paystack actually charged matches what we expect - never
  // trust a client-supplied amount, and never credit more/less than agreed.
  if (verified.amount !== payment.amountKobo) {
    throw new AppError('Payment amount mismatch - possible tampering. Contact support.', 400);
  }
  if (verified.currency !== 'NGN') {
    throw new AppError('Unexpected payment currency', 400);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Re-check inside the transaction to close the race between two concurrent
      // verification calls (webhook + redirect arriving near-simultaneously).
      const freshPayment = await Payment.findById(payment._id).session(session);
      if (freshPayment.status === 'SUCCESS') return; // another call already processed it

      freshPayment.status = 'SUCCESS';
      freshPayment.verifiedAt = new Date();
      freshPayment.processedEventIds.push(`${eventSource}:${Date.now()}`);
      await freshPayment.save({ session });

      if (freshPayment.paymentType === 'ORDER_PAYMENT') {
        await markOrderPaid(freshPayment.order, session);
      } else if (freshPayment.paymentType === 'SUBSCRIPTION') {
        await activateSubscriptionFromPayment(freshPayment, session);
      }
    });
  } finally {
    session.endSession();
  }

  const finalPayment = await Payment.findById(payment._id);

  if (finalPayment.paymentType === 'ORDER_PAYMENT') {
    const order = await Order.findById(finalPayment.order).populate('client worker task');
    await notify({
      userId: order.client._id,
      type: 'PAYMENT_RECEIVED',
      title: 'Payment confirmed',
      body: `Payment for "${order.task.title}" was confirmed. Work can now begin.`,
      entityType: 'ORDER',
      entityId: order._id,
    });
    await notify({
      userId: order.worker._id,
      type: 'TASK_STARTED',
      title: 'Order started',
      body: `Payment secured for "${order.task.title}" - you can start work.`,
      entityType: 'ORDER',
      entityId: order._id,
    });
    emailService.sendPaymentSuccessful(order.client, order);
  }

  return { payment: finalPayment, alreadyProcessed: false, success: true };
}

async function activateSubscriptionFromPayment(payment, session) {
  const settings = await getPlatformSettings();
  const subscription = await Subscription.findOneAndUpdate(
    { paymentReference: payment.paystackReference },
    {
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      priceKobo: payment.amountKobo,
    },
    { session, new: true }
  );
  if (subscription) {
    await User.updateOne(
      { _id: subscription.user },
      { plan: 'PRO', proExpiresAt: subscription.endDate },
      { session }
    );
  }
  return subscription;
}
