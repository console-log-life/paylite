import { AppError } from '../lib/errors.js';

// Express 4 does not catch errors from async handlers on its own.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

// All errors leave the API in one shape: { error: { code, message, ... } }.
// Express recognises an error handler by its four parameters, so `next` stays.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request is too large' } });
  }
  if (err.name === 'CastError') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Already exists' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
