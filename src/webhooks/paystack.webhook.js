import { Router } from 'express';
import express from 'express';
import { verifyWebhookSignature } from '../services/paystack.service.js';
import { AppError } from '../utils/AppError.js';
import * as paymentsController from '../controllers/payments.controller.js';

// This router must be mounted BEFORE the app-wide express.json() middleware,
// because Paystack's signature is computed over the raw request body - once
// JSON middleware has parsed and re-serialized it, the signature can no longer
// be verified reliably.
const router = Router();

router.post(
  '/webhook/paystack',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    const signature = req.headers['x-paystack-signature'];
    const isValid = verifyWebhookSignature(req.body, signature);
    if (!isValid) return next(new AppError('Invalid webhook signature', 401));
    req.body = JSON.parse(req.body.toString('utf8'));
    next();
  },
  paymentsController.handlePaystackWebhook
);

export default router;
