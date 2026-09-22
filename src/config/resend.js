import { Resend } from 'resend';
import { env } from './env.js';

// If RESEND_API_KEY isn't configured yet, we still export a client reference so the
// app's structure stays correct; email.service.js checks for the key before sending.
export const resendClient = env.resend.apiKey ? new Resend(env.resend.apiKey) : null;
