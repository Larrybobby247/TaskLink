import { z } from 'zod';

export const sendMessageSchema = z.object({
  text: z.string().trim().max(4000).optional(),
  attachment: z.object({ url: z.string().url(), publicId: z.string(), resourceType: z.string().optional() }).optional(),
}).refine((data) => data.text || data.attachment, { message: 'A message must have text or an attachment' });
