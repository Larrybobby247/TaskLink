import { Application, Task, WorkerProfile } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { canApply, incrementApplicationUsage } from './applicationUsage.service.js';
import { getPlatformSettings } from './platformSettings.service.js';
import { notify } from './notification.service.js';
import { emailService } from './email.service.js';
import { User } from '../models/index.js';

export async function applyToTask(worker, taskId, payload) {
  const task = await Task.findById(taskId);
  if (!task) throw new AppError('Task not found', 404);

  // Business rule: a user cannot apply to their own task.
  if (String(task.client) === String(worker._id)) {
    throw new AppError('You cannot apply to your own task', 400);
  }
  if (!['PUBLISHED', 'APPLICATIONS_OPEN'].includes(task.status)) {
    throw new AppError('This task is no longer accepting applications', 400);
  }
  if (task.applicationDeadline && new Date() > task.applicationDeadline) {
    throw new AppError('The application deadline for this task has passed', 400);
  }
  if (new Date() > task.deadline) {
    throw new AppError('This task has expired', 400);
  }

  const settings = await getPlatformSettings();
  const usage = await canApply(worker, settings);
  if (!usage.allowed) {
    throw new AppError(
      `You've used all ${usage.limit} free applications this month. Upgrade to Pro for unlimited applications.`,
      403
    );
  }

  if (task.budgetType !== 'NEGOTIABLE' && payload.proposedAmountKobo) {
    delete payload.proposedAmountKobo; // ignore proposed price on fixed-budget tasks
  }

  let application;
  try {
    application = await Application.create({ task: task._id, worker: worker._id, ...payload });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You have already applied to this task', 400);
    throw err;
  }

  await incrementApplicationUsage(worker._id);
  await Task.updateOne({ _id: task._id }, { $inc: { applicationCount: 1 }, status: 'APPLICATIONS_OPEN' });

  const client = await User.findById(task.client);
  await notify({
    userId: client._id,
    type: 'NEW_APPLICATION',
    title: 'New application received',
    body: `${worker.fullName} applied to "${task.title}"`,
    entityType: 'TASK',
    entityId: task._id,
  });
  if (client.notificationPreferences?.email?.applications) {
    emailService.sendNewApplicationNotification(client, task, worker);
  }

  return application;
}

export async function withdrawApplication(workerId, applicationId) {
  const application = await Application.findOne({ _id: applicationId, worker: workerId });
  if (!application) throw new AppError('Application not found', 404);
  if (application.status !== 'PENDING' && application.status !== 'SHORTLISTED') {
    throw new AppError(`Cannot withdraw an application in status ${application.status}`, 400);
  }
  application.status = 'WITHDRAWN';
  application.withdrawnAt = new Date();
  await application.save();
  return application;
}

export async function listApplicationsForTask(clientId, taskId, { status } = {}) {
  const task = await Task.findOne({ _id: taskId, client: clientId });
  if (!task) throw new AppError('Task not found or you are not the owner', 404);

  const filter = { task: taskId };
  if (status) filter.status = status;

  return Application.find(filter)
    .sort({ createdAt: -1 })
    .populate('worker', 'fullName username profileImage rating reviewCount completedTasksAsWorker');
}

export async function shortlistApplication(clientId, applicationId) {
  const application = await Application.findById(applicationId).populate('task');
  if (!application) throw new AppError('Application not found', 404);
  if (String(application.task.client) !== String(clientId)) throw new AppError('Not authorized', 403);
  application.status = 'SHORTLISTED';
  await application.save();
  return application;
}

export async function rejectApplication(clientId, applicationId) {
  const application = await Application.findById(applicationId).populate('task');
  if (!application) throw new AppError('Application not found', 404);
  if (String(application.task.client) !== String(clientId)) throw new AppError('Not authorized', 403);

  application.status = 'REJECTED';
  application.rejectedAt = new Date();
  await application.save();

  const worker = await User.findById(application.worker);
  await notify({
    userId: worker._id,
    type: 'APPLICATION_REJECTED',
    title: 'Application update',
    body: `Your application for "${application.task.title}" was not selected`,
    entityType: 'TASK',
    entityId: application.task._id,
  });
  emailService.sendApplicationRejected(worker, application.task);

  return application;
}
