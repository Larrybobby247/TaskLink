import mongoose from 'mongoose';
import { Order, Application, Task, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { calculatePlatformFeeKobo, calculateNetAmountKobo } from '../utils/money.js';
import { getPlatformSettings, getCommissionPercentForUser } from './platformSettings.service.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';
import { appendLedgerEntry } from './wallet.service.js';
import { generateReference } from '../utils/crypto.js';

/**
 * Selecting a worker locks the task, creates the frozen Order agreement, and
 * closes/rejects the other applications. The agreed price is frozen here and
 * never re-derived from Task afterward - this is what makes the Order the
 * durable source of truth for the agreement.
 */
export async function selectWorker(clientId, applicationId) {
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      const application = await Application.findById(applicationId).session(session).populate('task');
      if (!application) throw new AppError('Application not found', 404);

      const task = application.task;
      if (String(task.client) !== String(clientId)) throw new AppError('Not authorized', 403);
      if (task.status === 'WORKER_SELECTED' || task.status === 'PAYMENT_SECURED' || task.status === 'IN_PROGRESS') {
        throw new AppError('A worker has already been selected for this task', 400);
      }
      if (!['PUBLISHED', 'APPLICATIONS_OPEN'].includes(task.status)) {
        throw new AppError(`Cannot select a worker for a task in status ${task.status}`, 400);
      }

      const worker = await User.findById(application.worker).session(session);
      const settings = await getPlatformSettings();
      const commissionPercent = getCommissionPercentForUser(worker, settings);

      const agreedAmountKobo =
        task.budgetType === 'NEGOTIABLE' && application.proposedAmountKobo
          ? application.proposedAmountKobo
          : task.budgetKobo;

      const platformFeeKobo = calculatePlatformFeeKobo(agreedAmountKobo, commissionPercent);
      const workerNetAmountKobo = agreedAmountKobo - platformFeeKobo;

      const [createdOrder] = await Order.create(
        [
          {
            task: task._id,
            application: application._id,
            client: clientId,
            worker: worker._id,
            agreedAmountKobo,
            commissionPercent,
            platformFeeKobo,
            workerNetAmountKobo,
            deadline: task.deadline,
            status: 'AWAITING_PAYMENT',
            maxRevisions: settings.maxRevisions,
          },
        ],
        { session }
      );
      order = createdOrder;

      application.status = 'ACCEPTED';
      application.acceptedAt = new Date();
      await application.save({ session });

      // Reject all other still-open applications for this task.
      await Application.updateMany(
        { task: task._id, _id: { $ne: application._id }, status: { $in: ['PENDING', 'SHORTLISTED'] } },
        { status: 'REJECTED', rejectedAt: new Date() },
        { session }
      );

      task.status = 'WORKER_SELECTED';
      await task.save({ session });
    });

    const populatedOrder = await Order.findById(order._id).populate('task worker client');
    const worker = populatedOrder.worker;
    await notify({
      userId: worker._id,
      type: 'WORKER_SELECTED',
      title: 'You were selected!',
      body: `You were selected for "${populatedOrder.task.title}". Waiting on client payment.`,
      entityType: 'ORDER',
      entityId: populatedOrder._id,
    });
    emailService.sendApplicationAccepted(worker, populatedOrder.task);

    return populatedOrder;
  } finally {
    session.endSession();
  }
}

export async function getOrderById(orderId) {
  const order = await Order.findById(orderId).populate('task').populate('client', 'fullName username profileImage').populate('worker', 'fullName username profileImage');
  if (!order) throw new AppError('Order not found', 404);
  return order;
}

function assertParticipant(order, userId, role) {
  const uid = String(userId);
  if (role === 'client' && String(order.client._id || order.client) !== uid) {
    throw new AppError('Only the client on this order can perform this action', 403);
  }
  if (role === 'worker' && String(order.worker._id || order.worker) !== uid) {
    throw new AppError('Only the worker on this order can perform this action', 403);
  }
}

/** Called once payment is verified (see payment.service.js). Never callable directly by the frontend. */
export async function markOrderPaid(orderId, session = null) {
  const order = await Order.findById(orderId).session(session);
  if (!order) throw new AppError('Order not found', 404);
  order.paymentStatus = 'PAID';
  order.status = 'PAYMENT_SECURED';
  order.startedAt = new Date();
  await order.save({ session });

  await Task.updateOne({ _id: order.task }, { status: 'IN_PROGRESS' }, { session });
  order.status = 'IN_PROGRESS';
  await order.save({ session });
  return order;
}

export async function submitWork(workerId, orderId, { message, attachments }) {
  const order = await Order.findById(orderId).populate('task client');
  if (!order) throw new AppError('Order not found', 404);
  assertParticipant(order, workerId, 'worker');

  if (!['IN_PROGRESS', 'REVISION_REQUESTED'].includes(order.status)) {
    throw new AppError(`Cannot submit work for an order in status ${order.status}`, 400);
  }
  // Worker cannot submit before payment requirements are met.
  if (order.paymentStatus !== 'PAID') {
    throw new AppError('Payment must be secured before work can be submitted', 400);
  }

  order.submissions.push({ message, attachments, revisionNumber: order.revisionCount });
  order.status = 'SUBMITTED';
  order.submittedAt = new Date();
  await order.save();

  await notify({
    userId: order.client._id,
    type: 'WORK_SUBMITTED',
    title: 'Work submitted',
    body: `Work was submitted for "${order.task.title}"`,
    entityType: 'ORDER',
    entityId: order._id,
  });
  emailService.sendWorkSubmitted(order.client, order);

  return order;
}

export async function requestRevision(clientId, orderId, { message }) {
  const order = await Order.findById(orderId).populate('task worker');
  if (!order) throw new AppError('Order not found', 404);
  assertParticipant(order, clientId, 'client');

  if (order.status !== 'SUBMITTED') throw new AppError('Can only request a revision on submitted work', 400);
  if (order.revisionCount >= order.maxRevisions) {
    throw new AppError(`Maximum of ${order.maxRevisions} revisions reached. Consider opening a dispute instead.`, 400);
  }

  order.revisionCount += 1;
  order.revisionRequests.push({ message, revisionNumber: order.revisionCount });
  order.status = 'REVISION_REQUESTED';
  await order.save();

  await notify({
    userId: order.worker._id,
    type: 'REVISION_REQUESTED',
    title: 'Revision requested',
    body: `A revision was requested for "${order.task.title}"`,
    entityType: 'ORDER',
    entityId: order._id,
  });
  emailService.sendRevisionRequested(order.worker, order);

  return order;
}

/**
 * Client approves submitted work -> order completed, worker earns a ledger credit.
 * This is the only path that credits worker earnings; nothing else may do so.
 */
export async function approveOrder(clientId, orderId) {
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session).populate('task worker client');
      if (!order) throw new AppError('Order not found', 404);
      assertParticipant(order, clientId, 'client');
      if (order.status !== 'SUBMITTED') throw new AppError('Order must be in SUBMITTED status to approve', 400);

      order.status = 'COMPLETED';
      order.completedAt = new Date();
      await order.save({ session });

      await Task.updateOne({ _id: order.task._id }, { status: 'COMPLETED' }, { session });

      await appendLedgerEntry(
        {
          userId: order.worker._id,
          type: 'TASK_EARNING',
          amountKobo: order.workerNetAmountKobo,
          description: `Earnings for "${order.task.title}"`,
          order: order._id,
        },
        session
      );

      await User.updateOne(
        { _id: order.worker._id },
        { $inc: { completedTasksAsWorker: 1 } },
        { session }
      );
      await User.updateOne(
        { _id: order.client._id },
        { $inc: { completedTasksAsClient: 1 } },
        { session }
      );
    });

    await notify({
      userId: order.worker._id,
      type: 'TASK_COMPLETED',
      title: 'Task completed',
      body: `"${order.task.title}" was marked complete. Your earnings are now available.`,
      entityType: 'ORDER',
      entityId: order._id,
    });
    emailService.sendTaskCompleted(order.worker, order);

    return order;
  } finally {
    session.endSession();
  }
}

export async function cancelOrder(userId, orderId, reason) {
  const order = await Order.findById(orderId).populate('task');
  if (!order) throw new AppError('Order not found', 404);

  const uid = String(userId);
  if (String(order.client._id || order.client) !== uid && String(order.worker._id || order.worker) !== uid) {
    throw new AppError('Not authorized', 403);
  }
  // Cancelled orders cannot later be completed - COMPLETED and CANCELLED are terminal states.
  if (['COMPLETED', 'CANCELLED'].includes(order.status)) {
    throw new AppError(`Cannot cancel an order in status ${order.status}`, 400);
  }

  order.status = 'CANCELLED';
  order.cancelledAt = new Date();
  order.cancelReason = reason;
  await order.save();

  await Task.updateOne({ _id: order.task._id }, { status: 'CANCELLED' });

  // Note: if payment had already been captured, a refund must be processed through
  // payment.service.js (Paystack refund API) as a separate, explicit step - this
  // function only updates marketplace state, never money automatically.
  return order;
}
