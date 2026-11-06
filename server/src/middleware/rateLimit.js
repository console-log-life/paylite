import rateLimit from 'express-rate-limit';

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
};

// Login/sign-up: slows down password guessing.
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' } },
});

// PayLite ID lookup: stops someone listing every user by guessing IDs.
export const lookupLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 30,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many lookups, slow down' } },
});
