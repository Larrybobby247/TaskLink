import { z } from 'zod';

export const submitWorkSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  attachments: z.array(z.object({ url: z.string().url(), publicId: z.string(), originalName: z.string().optional() })).optional(),
});

export const submitPlanSchema = z.object({
  requirements: z.array(z.string().trim().min(1).max(300)).min(1, 'List at least one requirement').max(20),
  structure: z.string().trim().min(10, 'Describe how the work will be structured').max(3000),
  // Leave empty (or a single item) for a single payment; 2+ items = milestone payments.
  milestones: z.array(z.object({
    title: z.string().trim().min(2, 'Give each milestone a title').max(100),
    description: z.string().trim().max(500).optional(),
    amountKobo: z.number().int().min(10000, 'Each milestone must be at least ₦100'),
  })).max(10).optional(),
});

export const respondToPlanSchema = z.object({
  action: z.enum(['ACCEPT', 'REQUEST_CHANGES']),
  feedback: z.string().trim().max(1000).optional(),
});

export const declineWorkerSchema = z.object({
  reason: z.string().trim().max(500).optional(),
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
