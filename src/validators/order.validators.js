import { z } from 'zod';

export const submitWorkSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  attachments: z.array(z.object({ url: z.string().url(), publicId: z.string(), originalName: z.string().optional() })).optional(),
});

export const requestRevisionSchema = z.object({
  message: z.string().trim().min(5).max(2000),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000),
});

export const openDisputeSchema = z.object({
  reason: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(3000),
  evidence: z.array(z.object({ url: z.string().url(), publicId: z.string() })).optional(),
});
