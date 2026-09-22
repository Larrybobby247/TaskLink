import { resendClient } from '../config/resend.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import * as templates from '../templates/emailTemplates.js';

/**
 * Central email sending function. All notification emails go through here so
 * logic (from-address, dev fallback, error handling) lives in one place instead
 * of being duplicated across controllers.
 */
async function send({ to, subject, html }) {
  if (!resendClient) {

    logger.warn(`[email.service] RESEND_API_KEY not set - skipping email "${subject}" to ${to}`);
    return { skipped: true };
  }
  try {
    const result = await resendClient.emails.send({ from: env.resend.emailFrom, to, subject, html });
    console.log('RESEND RESULT:', result);
    if (result.error) {
  logger.error(`[email.service] Resend error: ${result.error.message}`);
  return { error: result.error.message };
}
    return result;
  } catch (err) {
    logger.error(`[email.service] Failed to send "${subject}" to ${to}: ${err.message}`);
    // Email failures should never crash the request that triggered them.
    return { error: err.message };
  }
}

export const emailService = {
  sendWelcome: (user) => send({ to: user.email, subject: 'Welcome to TaskLink', html: templates.welcome(user) }),

  sendVerificationEmail: (user, code) =>
    send({ to: user.email, subject: 'Verify your TaskLink email', html: templates.verificationCode(user, code) }),

  sendPasswordResetEmail: (user, resetUrl) =>
    send({ to: user.email, subject: 'Reset your TaskLink password', html: templates.passwordReset(user, resetUrl) }),

  sendNewApplicationNotification: (client, task, worker) =>
    send({
      to: client.email,
      subject: `New application for "${task.title}"`,
      html: templates.newApplication(client, task, worker),
    }),

  sendApplicationAccepted: (worker, task) =>
    send({ to: worker.email, subject: `You were selected for "${task.title}"`, html: templates.applicationAccepted(worker, task) }),

  sendApplicationRejected: (worker, task) =>
    send({ to: worker.email, subject: `Update on your application for "${task.title}"`, html: templates.applicationRejected(worker, task) }),

  sendPaymentSuccessful: (user, order) =>
    send({ to: user.email, subject: 'Payment confirmed', html: templates.paymentSuccessful(user, order) }),

  sendPaymentFailed: (user, order) =>
    send({ to: user.email, subject: 'Payment failed', html: templates.paymentFailed(user, order) }),

  sendWorkSubmitted: (client, order) =>
    send({ to: client.email, subject: 'Work submitted for your review', html: templates.workSubmitted(client, order) }),

  sendRevisionRequested: (worker, order) =>
    send({ to: worker.email, subject: 'A revision was requested', html: templates.revisionRequested(worker, order) }),

  sendTaskCompleted: (worker, order) =>
    send({ to: worker.email, subject: 'Task marked as completed', html: templates.taskCompleted(worker, order) }),

  sendNewReview: (user, review) =>
    send({ to: user.email, subject: 'You received a new review', html: templates.newReview(user, review) }),

  sendWithdrawalRequested: (user, withdrawal) =>
    send({ to: user.email, subject: 'Withdrawal request received', html: templates.withdrawalRequested(user, withdrawal) }),

  sendWithdrawalSuccessful: (user, withdrawal) =>
    send({ to: user.email, subject: 'Withdrawal successful', html: templates.withdrawalSuccessful(user, withdrawal) }),

  sendWithdrawalFailed: (user, withdrawal) =>
    send({ to: user.email, subject: 'Withdrawal failed', html: templates.withdrawalFailed(user, withdrawal) }),

  sendProActivated: (user, subscription) =>
    send({ to: user.email, subject: 'Welcome to TaskLink Pro', html: templates.proActivated(user, subscription) }),

  sendSecurityAlert: (user, message) =>
    send({ to: user.email, subject: 'Security notification', html: templates.securityAlert(user, message) }),

  sendNewMessageNotification: (user, sender) =>
    send({ to: user.email, subject: `New message from ${sender.fullName}`, html: templates.newMessage(user, sender) }),
};
