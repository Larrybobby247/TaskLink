import { z } from 'zod';

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  school: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
});

export const updateWorkerProfileSchema = z.object({
  headline: z.string().max(120).optional(),
  skills: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  availability: z.enum(['AVAILABLE', 'BUSY', 'UNAVAILABLE']).optional(),
});

export const switchModeSchema = z.object({
  mode: z.enum(['client', 'worker']),
});
