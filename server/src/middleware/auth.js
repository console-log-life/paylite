import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config.js';

export function signToken(userId) {
  return jwt.sign({ sub: userId.toString() }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Reads "Authorization: Bearer <token>" and sets req.userId.
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Please log in' } });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!mongoose.isValidObjectId(payload.sub)) throw new Error('bad subject');
    req.userId = new mongoose.Types.ObjectId(payload.sub);
    return next();
  } catch {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Session expired, please log in again' } });
  }
}
