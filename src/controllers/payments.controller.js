import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { ok } from '../utils/apiResponse.js';
import * as paymentService from '../services/payment.service.js';
import * as paystack from '../services/paystack.service.js';
import { env } from '../config/env.js';

export const initializePayment = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) throw new AppError('orderId is required', 400);
  const result = await paymentService.initializeOrderPayment(req.user, orderId);
  return ok(res, { ...result, publicKey: env.paystack.publicKey });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { reference } = req.body;
  if (!reference) throw new AppError('reference is required', 400);
  const result = await paymentService.verifyAndProcessPayment(reference, 'redirect');
  return ok(res, result);
});

/**
 * Webhook handler. Signature verification happens in the route setup (raw body
 * required) before this controller runs - see routes/payments.routes.js and
 * webhooks/paystack.webhook.js.
 */
export const handlePaystackWebhook = asyncHandler(async (req, res) => {
  const event = req.body; // parsed JSON, already signature-verified upstream
  if (event.event === 'charge.success') {
    await paymentService.verifyAndProcessPayment(event.data.reference, 'webhook');
  }
  // Always 200 quickly so Paystack doesn't retry unnecessarily once we've accepted the event.
  res.status(200).json({ received: true });
});
