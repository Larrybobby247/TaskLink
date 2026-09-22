// Reusable, self-contained HTML email templates. Kept intentionally simple
// (table-based, inline styles) for broad email client compatibility.

const brandColor = '#1E3A5F';

function layout(title, bodyHtml) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6f8;padding:24px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:${brandColor};padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;">TaskLink</span>
      </div>
      <div style="padding:24px;color:#1a1a1a;font-size:15px;line-height:1.6;">
        <h2 style="margin-top:0;color:${brandColor};">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:16px 24px;background:#f4f6f8;color:#8a8a8a;font-size:12px;">
        TaskLink · Need something done? Find someone nearby.
      </div>
    </div>
  </div>`;
}

export const welcome = (user) =>
  layout('Welcome to TaskLink', `<p>Hi ${user.fullName},</p><p>Your account is ready. Post a task or find work whenever you like — no separate accounts needed.</p>`);

export const verificationCode = (user, code) =>
  layout('Verify your email', `<p>Hi ${user.fullName},</p><p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${code}</p><p>This code expires in 15 minutes.</p>`);

export const passwordReset = (user, resetUrl) =>
  layout('Reset your password', `<p>Hi ${user.fullName},</p><p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}" style="background:${brandColor};color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Reset password</a></p>`);

export const newApplication = (client, task, worker) =>
  layout('New application', `<p>Hi ${client.fullName},</p><p>${worker.fullName} applied to your task "${task.title}".</p>`);

export const applicationAccepted = (worker, task) =>
  layout('You were selected!', `<p>Hi ${worker.fullName},</p><p>You were selected for "${task.title}". Please wait for the client to complete payment before starting work.</p>`);

export const applicationRejected = (worker, task) =>
  layout('Application update', `<p>Hi ${worker.fullName},</p><p>The client chose another applicant for "${task.title}". Keep applying — new tasks are posted every day.</p>`);

export const paymentSuccessful = (user, order) =>
  layout('Payment confirmed', `<p>Hi ${user.fullName},</p><p>Payment for order #${order._id} has been confirmed and secured.</p>`);

export const paymentFailed = (user, order) =>
  layout('Payment failed', `<p>Hi ${user.fullName},</p><p>We couldn't confirm payment for order #${order._id}. Please try again.</p>`);

export const workSubmitted = (client, order) =>
  layout('Work submitted', `<p>Hi ${client.fullName},</p><p>The worker submitted their work for order #${order._id}. Please review it.</p>`);

export const revisionRequested = (worker, order) =>
  layout('Revision requested', `<p>Hi ${worker.fullName},</p><p>The client requested a revision for order #${order._id}.</p>`);

export const taskCompleted = (worker, order) =>
  layout('Task completed', `<p>Hi ${worker.fullName},</p><p>Order #${order._id} was marked completed and your earnings are now available.</p>`);

export const newReview = (user, review) =>
  layout('New review', `<p>Hi ${user.fullName},</p><p>You received a ${review.rating}-star review.</p>`);

export const withdrawalRequested = (user, withdrawal) =>
  layout('Withdrawal received', `<p>Hi ${user.fullName},</p><p>Your withdrawal request for ${withdrawal.amountKobo / 100} NGN is being processed.</p>`);

export const withdrawalSuccessful = (user, withdrawal) =>
  layout('Withdrawal successful', `<p>Hi ${user.fullName},</p><p>${withdrawal.netAmountKobo / 100} NGN has been sent to your bank account.</p>`);

export const withdrawalFailed = (user, withdrawal) =>
  layout('Withdrawal failed', `<p>Hi ${user.fullName},</p><p>Your withdrawal could not be completed. Funds remain in your wallet.</p>`);

export const proActivated = (user) =>
  layout('Welcome to Pro', `<p>Hi ${user.fullName},</p><p>Your TaskLink Pro subscription is now active — enjoy unlimited applications and lower fees.</p>`);

export const securityAlert = (user, message) =>
  layout('Security notification', `<p>Hi ${user.fullName},</p><p>${message}</p>`);

export const newMessage = (user, sender) =>
  layout('New message', `<p>Hi ${user.fullName},</p><p>You have a new message from ${sender.fullName}.</p>`);
