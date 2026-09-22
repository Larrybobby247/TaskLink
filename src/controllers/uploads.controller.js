import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { created } from '../utils/apiResponse.js';
import { uploadBuffer } from '../services/upload.service.js';

export const uploadTaskAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file provided', 400);
  const result = await uploadBuffer(req.file.buffer, { folder: 'task-attachments', resourceType: 'auto' });
  return created(res, {
    attachment: { url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type, originalName: req.file.originalname },
  });
});

export const uploadSubmissionFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file provided', 400);
  const result = await uploadBuffer(req.file.buffer, { folder: 'submissions', resourceType: 'auto' });
  return created(res, {
    attachment: { url: result.secure_url, publicId: result.public_id, originalName: req.file.originalname },
  });
});

export const uploadChatAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('No file provided', 400);
  const result = await uploadBuffer(req.file.buffer, { folder: 'chat-attachments', resourceType: 'auto' });
  return created(res, { attachment: { url: result.secure_url, publicId: result.public_id, resourceType: result.resource_type } });
});
