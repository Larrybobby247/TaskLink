import { z } from 'zod';

export const createTaskSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(5000),
  category: z.string().length(24, 'Invalid category id'),
  budgetType: z.enum(['FIXED', 'NEGOTIABLE']).default('FIXED'),
  budgetKobo: z.number().int().nonnegative(),
  location: z.string().trim().optional(),
  isRemote: z.boolean().default(true),
  deadline: z.coerce.date(),
  applicationDeadline: z.coerce.date().optional(),
  workersRequired: z.number().int().min(1).default(1),
  skillsRequired: z.array(z.string()).optional(),
  additionalInstructions: z.string().max(2000).optional(),
}).refine((data) => data.deadline > new Date(), { message: 'Deadline must be in the future', path: ['deadline'] })
  .refine((data) => data.isRemote || (data.location && data.location.length > 0), {
    message: 'Location is required for on-site tasks',
    path: ['location'],
  });

export const applyToTaskSchema = z.object({
  message: z.string().trim().min(10).max(2000),
  proposedAmountKobo: z.number().int().nonnegative().optional(),
  estimatedCompletionHours: z.number().positive().optional(),
  portfolioItemId: z.string().optional(),
});

export const searchTasksQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  isRemote: z.string().optional(),
  minBudgetKobo: z.coerce.number().optional(),
  maxBudgetKobo: z.coerce.number().optional(),
  sort: z.enum(['newest', 'highest_paying', 'urgent']).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
