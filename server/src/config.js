// Settings come from environment variables (see .env.example).
export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

export function assertConfig() {
  const missing = ['mongoUri', 'jwtSecret'].filter((k) => !config[k]);
  if (missing.length) {
    const names = { mongoUri: 'MONGODB_URI', jwtSecret: 'JWT_SECRET' };
    throw new Error(`Missing environment variables: ${missing.map((k) => names[k]).join(', ')}`);
  }
}
