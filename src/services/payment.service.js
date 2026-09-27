import mongoose from 'mongoose';
import { Payment, Order, Subscription, User, Task } from '../models/index.js';
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
 * Initializes payment for boosting/featuring a task so it surfaces more
 * prominently to workers. The fee is always read from PlatformSetting -
 * never accepted from the frontend - so it can be changed platform-wide by
 * an admin (see admin.controller.js#updateSettings) without touching this code.
 */
export async function initializeFeaturedTaskPayment(user, taskId) {
  const task = await Task.findById(taskId);
  if (!task) throw new AppError('Task not found', 404);
  if (String(task.client) !== String(user._id)) throw new AppError('Only the task owner can boost this task', 403);

  const NOT_BOOSTABLE_STATUSES = ['DRAFT', 'CANCELLED', 'COMPLETED', 'EXPIRED'];
  if (NOT_BOOSTABLE_STATUSES.includes(task.status)) {
    throw new AppError(`A task in status ${task.status} cannot be boosted`, 400);
  }
  if (task.isFeatured && task.featuredUntil && task.featuredUntil > new Date()) {
    throw new AppError('This task is already boosted', 400);
  }

  const settings = await getPlatformSettings();
  const amountKobo = settings.featuredTaskPriceKobo;
  const reference = generateReference('BOOST');

  const payment = await Payment.create({
    user: user._id,
    task: task._id,
    paystackReference: reference,
    amountKobo,
    status: 'INITIALIZED',
    paymentType: 'FEATURED_TASK',
    metadata: { taskId: String(task._id) },
  });

  const paystackData = await paystack.initializeTransaction({
    email: user.email,
    amountKobo,
    reference,
    metadata: { taskId: String(task._id), userId: String(user._id), paymentType: 'FEATURED_TASK' },
  });

  payment.paystackAccessCode = paystackData.access_code;
  await payment.save();

  return { authorizationUrl: paystackData.authorization_url, reference, amountKobo };
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
      } else if (freshPayment.paymentType === 'FEATURED_TASK') {
        await activateFeaturedTask(freshPayment, session);
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
  } else if (finalPayment.paymentType === 'FEATURED_TASK') {
    const task = await Task.findById(finalPayment.task);
    if (task) {
      await notify({
        userId: task.client,
        type: 'PAYMENT_RECEIVED',
        title: 'Task boosted 🚀',
        body: `"${task.title}" is now featured and will reach more workers until ${task.featuredUntil?.toLocaleDateString?.() || 'soon'}.`,
        entityType: 'TASK',
        entityId: task._id,
      });
    }
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

/** Marks a task as featured once its boost payment succeeds. */
async function activateFeaturedTask(payment, session) {
  const settings = await getPlatformSettings();
  const durationMs = settings.featuredTaskDurationDays * 24 * 60 * 60 * 1000;

  await Task.updateOne(
    { _id: payment.task },
    { isFeatured: true, featuredUntil: new Date(Date.now() + durationMs) },
    { session }
  );
}
