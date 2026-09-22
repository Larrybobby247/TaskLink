import cloudinary from '../config/cloudinary.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

const ALLOWED_RESOURCE_TYPES = ['image', 'raw', 'auto'];

/**
 * Uploads a buffer (from multer memory storage) to Cloudinary. Files are
 * validated for size/type by the multer config (see middleware/upload.middleware.js)
 * before ever reaching this function - never trust the client's declared mime type alone.
 */
export function uploadBuffer(buffer, { folder, resourceType = 'auto' }) {
  if (!env.cloudinary.cloudName) {
    throw new AppError('File uploads are not configured on this server yet (missing Cloudinary credentials)', 503);
  }
  if (!ALLOWED_RESOURCE_TYPES.includes(resourceType)) resourceType = 'auto';

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `tasklink/${folder}`, resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function deleteAsset(publicId, resourceType = 'image') {
  if (!env.cloudinary.cloudName) return;
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

/**
 * Returns a short-lived signature so the frontend can, if desired, upload
 * directly to Cloudinary without ever handling the API secret. Server-side
 * upload via uploadBuffer() above is the default/simpler path used by this app.
 */
export function generateUploadSignature(paramsToSign) {
  if (!env.cloudinary.apiSecret) {
    throw new AppError('File uploads are not configured on this server yet (missing Cloudinary credentials)', 503);
  }
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request({ ...paramsToSign, timestamp }, env.cloudinary.apiSecret);
  return { timestamp, signature, apiKey: env.cloudinary.apiKey, cloudName: env.cloudinary.cloudName };
}
