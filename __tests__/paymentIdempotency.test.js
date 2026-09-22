import { describe, it, expect, jest } from '@jest/globals';

// Unit-level test of the idempotency guard logic in payment.service.js without a
// live Paystack connection: verifies that a Payment already marked SUCCESS is
// never re-processed by verifyAndProcessPayment.
jest.unstable_mockModule('../src/services/paystack.service.js', () => ({
  verifyTransaction: jest.fn(),
  initializeTransaction: jest.fn(),
  verifyWebhookSignature: jest.fn(),
}));

describe('payment idempotency', () => {
  it('short-circuits when the payment has already succeeded', async () => {
    const paystack = await import('../src/services/paystack.service.js');
    const { Payment } = await import('../src/models/index.js');

    const findOneMock = jest.spyOn(Payment, 'findOne').mockResolvedValue({ status: 'SUCCESS' });
    const { verifyAndProcessPayment } = await import('../src/services/payment.service.js');

    const result = await verifyAndProcessPayment('SOME_REF', 'webhook');

    expect(result.alreadyProcessed).toBe(true);
    expect(paystack.verifyTransaction).not.toHaveBeenCalled();
    findOneMock.mockRestore();
  });
});
