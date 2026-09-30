import { z } from 'zod';

export const requestWithdrawalSchema = z.object({
  amountKobo: z.number().int().positive(),
});

export const addBankAccountSchema = z.object({
  bankName: z.string().trim().min(2).max(100),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must contain exactly 10 digits'),
  accountName: z.string().trim().min(2).max(100),
  bankCode: z.string().trim().min(2).max(20).optional(),
});
