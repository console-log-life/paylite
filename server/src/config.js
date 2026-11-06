// Settings come from environment variables (see .env.example).
export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  // Razorpay (test mode keys work). Without them, "Add money" runs in demo
  // mode and credits the wallet directly.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  // Demo top-ups are allowed only when Razorpay is off, unless forced on
  // (the tests use this to fund wallets quickly).
  allowDemoTopup: process.env.ALLOW_DEMO_TOPUP === 'true',
};

export function assertConfig() {
  const missing = ['mongoUri', 'jwtSecret'].filter((k) => !config[k]);
  if (missing.length) {
    const names = { mongoUri: 'MONGODB_URI', jwtSecret: 'JWT_SECRET' };
    throw new Error(`Missing environment variables: ${missing.map((k) => names[k]).join(', ')}`);
  }
}
