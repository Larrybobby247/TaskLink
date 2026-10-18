import mongoose from 'mongoose';
import { Order, Application, Task, User } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { calculatePlatformFeeKobo, calculateNetAmountKobo } from '../utils/money.js';
import { getPlatformSettings, getCommissionPercentForUser } from './platformSettings.service.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';
import { appendLedgerEntry } from './wallet.service.js';
import { generateReference } from '../utils/crypto.js';

const isTaskPost = (task) => !task.source || task.source === 'TASK_POST';

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
    let usesPlanStep = false;
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
      if (!['PENDING', 'SHORTLISTED'].includes(application.status)) {
        throw new AppError(`This application can no longer be selected (status ${application.status})`, 400);
      }

      const worker = await User.findById(application.worker).session(session);
      const settings = await getPlatformSettings();
      const commissionPercent = getCommissionPercentForUser(worker, settings);

      const agreedAmountKobo =
        task.budgetType === 'NEGOTIABLE' && application.proposedAmountKobo
          ? application.proposedAmountKobo
          : task.budgetKobo;

      // Normal task posts go through the plan step first. Gig orders and direct
      // hires already define the brief, so they go straight to payment.
      usesPlanStep = isTaskPost(task);

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
            status: usesPlanStep ? 'AWAITING_PLAN' : 'AWAITING_PAYMENT',
            maxRevisions: settings.maxRevisions,
          },
        ],
        { session }
      );
      order = createdOrder;

      application.status = 'ACCEPTED';
      application.acceptedAt = new Date();
      await application.save({ session });

      // Gig orders / direct hires: reject the others straight away (there are none).
      // Task posts: the other applicants stay open until the plan is approved AND
      // payment is secured, so the client can still switch to another worker.
      if (!usesPlanStep) {
        await Application.updateMany(
          { task: task._id, _id: { $ne: application._id }, status: { $in: ['PENDING', 'SHORTLISTED'] } },
          { status: 'REJECTED', rejectedAt: new Date() },
          { session }
        );
      }

      task.status = 'WORKER_SELECTED';
      await task.save({ session });
    });

    const populatedOrder = await Order.findById(order._id).populate('task worker client');
    const worker = populatedOrder.worker;
    await notify({
      userId: worker._id,
      type: 'WORKER_SELECTED',
      title: 'You were selected!',
      body: usesPlanStep
        ? `You were selected for "${populatedOrder.task.title}". Send the client your requirements and how you will structure the work.`
        : `You were selected for "${populatedOrder.task.title}". Waiting on client payment.`,
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

// -----------------------------------------------------------------------------
// Work plan (task-post flow): worker proposes -> client approves -> payment
// -----------------------------------------------------------------------------

const hasMilestones = (order) => Boolean(order.plan?.useMilestones && order.plan.milestones?.length);

/** Milestone the worker is currently working on (funded, or sent back for changes). */
const activeMilestone = (order) =>
  order.plan.milestones.find((m) => ['FUNDED', 'REVISION_REQUESTED'].includes(m.status));

/** The milestone waiting on the client's review. */
const submittedMilestone = (order) => order.plan.milestones.find((m) => m.status === 'SUBMITTED');

/**
 * Worker sends (or re-sends) requirements + structure + optional milestones.
 * Milestone amounts must add up exactly to the agreed price - the price itself
 * is never changed here.
 */
export async function submitPlan(workerId, orderId, { requirements, structure, milestones }) {
  const order = await Order.findById(orderId).populate('task client');
  if (!order) throw new AppError('Order not found', 404);
  assertParticipant(order, workerId, 'worker');

  if (order.status !== 'AWAITING_PLAN') {
    throw new AppError('A work plan can only be sent while the client is waiting for it', 400);
  }

  const cleanRequirements = (requirements || []).map((r) => String(r).trim()).filter(Boolean);
  if (cleanRequirements.length === 0) throw new AppError('List at least one requirement', 400);
  if (!structure || String(structure).trim().length < 10) {
    throw new AppError('Describe how the work will be structured (at least 10 characters)', 400);
  }

  const useMilestones = Array.isArray(milestones) && milestones.length >= 2;
  let milestoneDocs = [];

  if (useMilestones) {
    const total = milestones.reduce((sum, m) => sum + m.amountKobo, 0);
    if (total !== order.agreedAmountKobo) {
      throw new AppError(
        `Milestone amounts must add up to the agreed price (${order.agreedAmountKobo / 100}). They currently add up to ${total / 100}.`,
        400
      );
    }

    // Split the platform fee across milestones; the last one takes the rounding
    // remainder so the parts always sum to the order totals.
    let feeSoFar = 0;
    milestoneDocs = milestones.map((m, i) => {
      const isLast = i === milestones.length - 1;
      const fee = isLast
        ? order.platformFeeKobo - feeSoFar
        : calculatePlatformFeeKobo(m.amountKobo, order.commissionPercent);
      feeSoFar += fee;
      return {
        title: m.title,
        description: m.description || undefined,
        amountKobo: m.amountKobo,
        platformFeeKobo: fee,
        workerNetKobo: m.amountKobo - fee,
        status: 'PENDING_PAYMENT',
      };
    });
  }

  order.plan = {
    requirements: cleanRequirements,
    structure: String(structure).trim(),
    useMilestones,
    milestones: milestoneDocs,
    clientFeedback: undefined,
    changeRequestCount: order.plan?.changeRequestCount || 0,
    submittedAt: new Date(),
  };
  order.status = 'PLAN_REVIEW';
  await order.save();

  await notify({
    userId: order.client._id,
    type: 'PLAN_SUBMITTED',
    title: 'Work plan ready for review',
    body: `Your selected worker sent their requirements and work plan for "${order.task.title}". Review it to continue.`,
    entityType: 'ORDER',
    entityId: order._id,
  });

  return order;
}

/** Client approves the plan (-> payment) or sends it back with feedback. */
export async function respondToPlan(clientId, orderId, { action, feedback }) {
  const order = await Order.findById(orderId).populate('task worker');
  if (!order) throw new AppError('Order not found', 404);
  assertParticipant(order, clientId, 'client');

  if (order.status !== 'PLAN_REVIEW') throw new AppError('There is no work plan waiting for your review', 400);

  if (action === 'ACCEPT') {
    order.status = 'AWAITING_PAYMENT';
    order.plan.acceptedAt = new Date();
    await order.save();

    await notify({
      userId: order.worker._id,
      type: 'PLAN_APPROVED',
      title: 'Your work plan was approved',
      body: `The client approved your plan for "${order.task.title}". You can start once they have paid.`,
      entityType: 'ORDER',
      entityId: order._id,
    });
    return order;
  }

  const note = String(feedback || '').trim();
  if (note.length < 5) throw new AppError('Tell the worker what you would like changed (at least 5 characters)', 400);

  order.status = 'AWAITING_PLAN';
  order.plan.clientFeedback = note;
  order.plan.changeRequestCount = (order.plan.changeRequestCount || 0) + 1;
  await order.save();

  await notify({
    userId: order.worker._id,
    type: 'PLAN_CHANGES_REQUESTED',
    title: 'Changes requested to your plan',
    body: `The client asked for changes to your plan for "${order.task.title}": ${note.slice(0, 120)}`,
    entityType: 'ORDER',
    entityId: order._id,
  });
  return order;
}

/**
 * Client does not want to continue with this worker (before paying anything).
 * The task re-opens so another applicant can be selected.
 */
export async function declineWorker(clientId, orderId, reason) {
  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session).populate('task worker');
      if (!order) throw new AppError('Order not found', 404);
      assertParticipant(order, clientId, 'client');

      if (!['AWAITING_PLAN', 'PLAN_REVIEW'].includes(order.status) || order.paymentStatus !== 'UNPAID') {
        throw new AppError('You can only choose a different worker before payment has been made', 400);
      }

      order.status = 'CANCELLED';
      order.cancelledAt = new Date();
      order.cancelReason = reason?.trim() || 'Client chose a different worker';
      await order.save({ session });

      await Application.updateOne(
        { _id: order.application },
        { status: 'REJECTED', rejectedAt: new Date() },
        { session }
      );

      // Re-open the task for applications again.
      await Task.updateOne({ _id: order.task._id, status: 'WORKER_SELECTED' }, { status: 'APPLICATIONS_OPEN' }, { session });
    });

    await notify({
      userId: order.worker._id,
      type: 'WORKER_DECLINED',
      title: 'Application update',
      body: `The client decided to go with a different worker for "${order.task.title}".`,
      entityType: 'TASK',
      entityId: order.task._id,
    });
    return order;
  } finally {
    session.endSession();
  }
}

/**
 * Once the selected worker's plan is approved AND paid for, the remaining
 * applicants are told they were not chosen. Safe to call more than once.
 */
export async function rejectOtherApplicants(orderId) {
  const order = await Order.findById(orderId).populate('task');
  if (!order || !isTaskPost(order.task)) return;

  const others = await Application.find({
    task: order.task._id,
    _id: { $ne: order.application },
    status: { $in: ['PENDING', 'SHORTLISTED'] },
  }).populate('worker');
  if (!others.length) return;

  await Application.updateMany(
    { _id: { $in: others.map((a) => a._id) } },
    { status: 'REJECTED', rejectedAt: new Date() }
  );

  for (const app of others) {
    try {
      await notify({
        userId: app.worker._id,
        type: 'APPLICATION_REJECTED',
        title: 'Application update',
        body: `Your application for "${order.task.title}" was not selected`,
        entityType: 'TASK',
        entityId: order.task._id,
      });
      emailService.sendApplicationRejected(app.worker, order.task);
    } catch {
      // Notification problems must never undo the rejection.
    }
  }
}

/**
 * Called once payment is verified (see payment.service.js). Never callable directly by the frontend.
 * For milestone orders `milestoneId` is the instalment that was just paid.
 */
export async function markOrderPaid(orderId, session = null, milestoneId = null) {
  const order = await Order.findById(orderId).session(session);
  if (!order) throw new AppError('Order not found', 404);

  if (hasMilestones(order) && milestoneId) {
    const milestone = order.plan.milestones.id(milestoneId);
    if (!milestone) throw new AppError('Milestone not found on this order', 404);
    if (milestone.status !== 'PENDING_PAYMENT') return order; // already processed

    milestone.status = 'FUNDED';
    milestone.fundedAt = new Date();

    const allFunded = order.plan.milestones.every((m) => m.status !== 'PENDING_PAYMENT');
    order.paymentStatus = allFunded ? 'PAID' : 'PARTIAL';

    // Funding the first milestone starts the job; funding a later one after the
    // previous milestone was approved resumes it.
    if (order.status === 'AWAITING_PAYMENT') {
      order.status = 'IN_PROGRESS';
      if (!order.startedAt) order.startedAt = new Date();
      await Task.updateOne({ _id: order.task }, { status: 'IN_PROGRESS' }, { session });
    }
    await order.save({ session });
    return order;
  }

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

  let milestone = null;
  if (hasMilestones(order)) {
    // Work is submitted against the milestone that has been paid for.
    milestone = activeMilestone(order);
    if (!milestone) {
      throw new AppError('The next milestone has not been paid for yet. You can submit once the client funds it.', 400);
    }
  } else if (order.paymentStatus !== 'PAID') {
    // Worker cannot submit before payment requirements are met.
    throw new AppError('Payment must be secured before work can be submitted', 400);
  }

  order.submissions.push({
    message,
    attachments,
    revisionNumber: order.revisionCount,
    milestone: milestone?._id,
  });
  if (milestone) {
    milestone.status = 'SUBMITTED';
    milestone.submittedAt = new Date();
  }
  order.status = 'SUBMITTED';
  order.submittedAt = new Date();
  await order.save();

  await notify({
    userId: order.client._id,
    type: 'WORK_SUBMITTED',
    title: 'Work submitted',
    body: milestone
      ? `Work for "${milestone.title}" was submitted on "${order.task.title}"`
      : `Work was submitted for "${order.task.title}"`,
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

  if (hasMilestones(order)) {
    const milestone = submittedMilestone(order);
    if (milestone) milestone.status = 'REVISION_REQUESTED';
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
 * Client approves submitted work. This is the only path that credits worker
 * earnings; nothing else may do so. For milestone orders each approval credits
 * just that milestone and the order completes after the last one.
 */
export async function approveOrder(clientId, orderId) {
  const session = await mongoose.startSession();
  try {
    let order;
    let completed = false;
    let approvedMilestoneTitle = null;
    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session).populate('task worker client');
      if (!order) throw new AppError('Order not found', 404);
      assertParticipant(order, clientId, 'client');
      if (order.status !== 'SUBMITTED') throw new AppError('Order must be in SUBMITTED status to approve', 400);

      let creditKobo = order.workerNetAmountKobo;
      let description = `Earnings for "${order.task.title}"`;

      if (hasMilestones(order)) {
        const milestone = submittedMilestone(order);
        if (!milestone) throw new AppError('No milestone is waiting for approval', 400);
        milestone.status = 'APPROVED';
        milestone.approvedAt = new Date();
        approvedMilestoneTitle = milestone.title;
        creditKobo = milestone.workerNetKobo;
        description = `Earnings for "${order.task.title}" - ${milestone.title}`;

        const remaining = order.plan.milestones.filter((m) => m.status !== 'APPROVED');
        completed = remaining.length === 0;
        if (!completed) {
          // Next step: keep working if the next milestone is paid, otherwise wait for payment.
          const next = remaining[0];
          order.status = next.status === 'FUNDED' ? 'IN_PROGRESS' : 'AWAITING_PAYMENT';
        }
      } else {
        completed = true;
      }

      if (completed) {
        order.status = 'COMPLETED';
        order.completedAt = new Date();
      }
      await order.save({ session });

      await appendLedgerEntry(
        {
          userId: order.worker._id,
          type: 'TASK_EARNING',
          amountKobo: creditKobo,
          description,
          order: order._id,
        },
        session
      );

      if (completed) {
        await Task.updateOne({ _id: order.task._id }, { status: 'COMPLETED' }, { session });
        await User.updateOne({ _id: order.worker._id }, { $inc: { completedTasksAsWorker: 1 } }, { session });
        await User.updateOne({ _id: order.client._id }, { $inc: { completedTasksAsClient: 1 } }, { session });
      }
    });

    if (completed) {
      await notify({
        userId: order.worker._id,
        type: 'TASK_COMPLETED',
        title: 'Task completed',
        body: `"${order.task.title}" was marked complete. Your earnings are now available.`,
        entityType: 'ORDER',
        entityId: order._id,
      });
      emailService.sendTaskCompleted(order.worker, order);
    } else {
      await notify({
        userId: order.worker._id,
        type: 'MILESTONE_APPROVED',
        title: 'Milestone approved',
        body: `"${approvedMilestoneTitle}" was approved on "${order.task.title}". Your earnings for it are now available.`,
        entityType: 'ORDER',
        entityId: order._id,
      });
    }

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
