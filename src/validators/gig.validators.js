import { z } from 'zod';

const packageSchema = z.object({
  name: z.enum(['BASIC', 'STANDARD', 'PREMIUM']),
  priceKobo: z.number().int().nonnegative(),
  deliveryDays: z.number().int().min(1),
  revisions: z.number().int().min(0).default(1),
  deliverables: z.array(z.string()).optional(),
});

export const createGigSchema = z.object({
  title: z.string().trim().min(5).max(120),
  category: z.string().length(24, 'Invalid category id'),
  skills: z.array(z.string()).optional(),
  description: z.string().trim().min(20).max(5000),
  startingPriceKobo: z.number().int().nonnegative(),
  deliveryDays: z.number().int().min(1),
  revisions: z.number().int().min(0).default(1),
  included: z.array(z.string()).optional(),
  excluded: z.array(z.string()).optional(),
  requirementsFromClient: z.string().max(2000).optional(),
  portfolioUrl: z.string().url().optional().or(z.literal('')),
  packages: z.array(packageSchema).max(3).optional(),
});

export const updateGigSchema = createGigSchema.partial();

export const orderGigSchema = z.object({
  packageName: z.enum(['BASIC', 'STANDARD', 'PREMIUM']).optional(),
  requirements: z.string().max(3000).optional(),
});

export const hireWorkerSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(5000),
  categoryId: z.string().length(24, 'Invalid category id'),
  budgetKobo: z.number().int().positive(),
  deadline: z.coerce.date(),
}).refine((data) => data.deadline > new Date(), { message: 'Deadline must be in the future', path: ['deadline'] });

export const searchGigsQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  minPriceKobo: z.coerce.number().optional(),
  maxPriceKobo: z.coerce.number().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  worker: z.string().optional(),
  sort: z.enum(['newest', 'price_low', 'price_high']).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
