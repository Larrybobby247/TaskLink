import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const client = axios.create({
  baseURL: env.paystack.baseUrl,
  headers: { Authorization: `Bearer ${env.paystack.secretKey}` },
});

/**
 * Initializes a Paystack transaction. `amountKobo` MUST already have been computed
 * server-side from the database (e.g. Order.agreedAmountKobo) - never accept an
 * amount supplied by the frontend here.
 */
export async function initializeTransaction({
  email,
  amountKobo,
  reference,
  metadata,
}) {
  if (!env.paystack.secretKey) {
    throw new AppError(
      'Payments are not configured on this server yet (missing PAYSTACK_SECRET_KEY)',
      503
    );
  }

  const callbackUrl = `${env.clientUrl}/payments/callback`;

  console.log('PAYSTACK CALLBACK:', callbackUrl);

  const response = await client.post('/transaction/initialize', {
    email,
    amount: amountKobo,
    reference,
    currency: 'NGN',
    callback_url: callbackUrl,
    metadata,
  });

  console.log('PAYSTACK RESPONSE:', response.data);

  return response.data.data;
}

/**
 * Verifies a transaction directly with Paystack. This is the ONLY source of truth
 * for whether a payment succeeded - never trust a frontend-reported status.
 */
export async function verifyTransaction(reference) {
  if (!env.paystack.secretKey) {
    throw new AppError('Payments are not configured on this server yet (missing PAYSTACK_SECRET_KEY)', 503);
  }
  const { data } = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data.data; // { status, amount, currency, reference, ... }
}

/** Verifies the X-Paystack-Signature header on incoming webhooks. */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!env.paystack.webhookSecret) return false;
  const hash = crypto.createHmac('sha512', env.paystack.webhookSecret).update(rawBody).digest('hex');
  return hash === signatureHeader;
}

export async function createTransferRecipient({ name, accountNumber, bankCode }) {
  if (!env.paystack.secretKey) {
    throw new AppError('Payouts are not configured on this server yet (missing PAYSTACK_SECRET_KEY)', 503);
  }
  const { data } = await client.post('/transferrecipient', {
    type: 'nuban',
    name,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: 'NGN',
  });
  return data.data; // includes recipient_code
}

export async function resolveAccountNumber({ accountNumber, bankCode }) {
  if (!env.paystack.secretKey) {
    throw new AppError('Bank verification is not configured on this server yet (missing PAYSTACK_SECRET_KEY)', 503);
  }
  const { data } = await client.get('/bank/resolve', { params: { account_number: accountNumber, bank_code: bankCode } });
  return data.data; // { account_number, account_name }
}

export async function listBanks() {
  const { data } = await client.get('/bank', { params: { country: 'nigeria' } });
  return data.data;
}

/**
 * Initiates a payout. Real-money withdrawal transfers should only be enabled once
 * the operational/regulatory requirements for the chosen payout flow are satisfied -
 * see README "Security & compliance considerations".
 */
export async function initiateTransfer({ amountKobo, recipientCode, reference, reason }) {
  if (!env.paystack.secretKey) {
    throw new AppError('Payouts are not configured on this server yet (missing PAYSTACK_SECRET_KEY)', 503);
  }
  const { data } = await client.post('/transfer', {
    source: 'balance',
    amount: amountKobo,
    recipient: recipientCode,
    reference,
    reason,
  });
  return data.data;
}
