import { z } from 'zod';

export const requestWithdrawalSchema = z.object({
  amountKobo: z.number().int().positive(),
});

export const addBankAccountSchema = z.object({
  bankName: z.string().min(2),
  bankCode: z.string().min(2),
  accountNumber: z.string().length(10),
});
