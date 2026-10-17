import { z } from 'zod';

const objectId = (label = 'id') => z.string().regex(/^[0-9a-fA-F]{24}$/, `Invalid ${label}`);

const packageSchema = z.object({
  name: z.enum(['BASIC', 'STANDARD', 'PREMIUM']),
  priceKobo: z.number().int().nonnegative(),
  deliveryDays: z.number().int('Delivery days must be a whole number').min(1),
  revisions: z.number().int('Revisions must be a whole number').min(0).default(1),
  deliverables: z.array(z.string()).optional(),
});

export const createGigSchema = z.object({
  title: z.string().trim().min(5).max(120),
  category: z.string().length(24, 'Invalid category id'),
  skills: z.array(z.string().trim().min(1).max(40)).max(15).optional(),
  description: z.string().trim().min(20).max(5000),
  startingPriceKobo: z.number().int().positive('Price must be greater than 0'),
  deliveryDays: z.number().int('Delivery days must be a whole number').min(1),
  revisions: z.number().int('Revisions must be a whole number').min(0).default(1),
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
  q: z.string().trim().max(100).optional(),
  category: objectId('category id').optional(),
  minPriceKobo: z.coerce.number().min(0).optional(),
  maxPriceKobo: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  worker: objectId('worker id').optional(),
  sort: z.enum(['newest', 'price_low', 'price_high']).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});

// Shared by GET /search (workers + gigs). Empty strings from the UI are treated
// as "not provided" instead of failing validation.
const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);

export const unifiedSearchQuerySchema = z.object({
  type: z.preprocess(emptyToUndefined, z.enum(['workers', 'gigs']).optional()),
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  category: z.preprocess(emptyToUndefined, objectId('category id').optional()),
  skill: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  location: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  availability: z.preprocess(emptyToUndefined, z.enum(['AVAILABLE', 'BUSY', 'UNAVAILABLE']).optional()),
  minPriceKobo: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  maxPriceKobo: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  minRating: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(5).optional()),
  worker: z.preprocess(emptyToUndefined, objectId('worker id').optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(['newest', 'price_low', 'price_high']).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
});
