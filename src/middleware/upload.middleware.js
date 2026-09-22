import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB default, matches PlatformSetting.maxAttachmentSizeMb
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new AppError(`File type ${file.mimetype} is not allowed`, 400));
  }
  cb(null, true);
}

export const uploadSingle = (fieldName) =>
  multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE_BYTES } }).single(fieldName);

export const uploadMultiple = (fieldName, maxCount = 5) =>
  multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE_BYTES } }).array(fieldName, maxCount);
