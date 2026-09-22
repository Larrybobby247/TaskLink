import dotenv from 'dotenv';
dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  serverUrl: process.env.SERVER_URL || 'http://localhost:5000',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/tasklink',
  jwtSecret: process.env.JWT_SECRET || 'dev_only_insecure_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtCookieName: process.env.JWT_COOKIE_NAME || 'tasklink_token',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET,
    baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM || 'TaskLink <info@accurrattehommes.com>',
  },
  platformDefaults: {
    commissionPercent: parseFloat(process.env.DEFAULT_COMMISSION_PERCENT || '5'),
    proCommissionPercent: parseFloat(process.env.PRO_COMMISSION_PERCENT || '3'),
    freeApplicationLimit: parseInt(process.env.DEFAULT_FREE_APPLICATION_LIMIT || '10', 10),
    withdrawalFeeKobo: parseInt(process.env.DEFAULT_WITHDRAWAL_FEE_KOBO || '0', 10),
    proMonthlyPriceKobo: parseInt(process.env.PRO_MONTHLY_PRICE_KOBO || '250000', 10),
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  },
};

export const isProd = env.nodeEnv === 'production';
