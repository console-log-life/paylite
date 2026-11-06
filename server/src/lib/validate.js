import { toPaise } from './money.js';
import { badRequest } from './errors.js';

// Small, explicit validators. Each throws a 400 with per-field messages.

export function readCredentials(body = {}, { requireName = false } = {}) {
  const errors = {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (password.length > 72) errors.password = 'Password must be at most 72 characters';
  if (requireName && (name.length < 2 || name.length > 60)) errors.name = 'Name must be 2 to 60 characters';

  if (Object.keys(errors).length) throw badRequest('Please fix the highlighted fields', { fields: errors });
  return { email, password, name };
}

export function readAmount(value, field = 'amount') {
  const paise = toPaise(value);
  if (paise === null) {
    throw badRequest('Enter a positive amount with at most 2 decimals', {
      fields: { [field]: 'Enter a positive amount with at most 2 decimals' },
    });
  }
  return paise;
}

export function readPin(value, field = 'pin') {
  const pin = typeof value === 'string' ? value : '';
  if (!/^\d{4,6}$/.test(pin)) {
    throw badRequest('PIN must be 4 to 6 digits', { fields: { [field]: 'PIN must be 4 to 6 digits' } });
  }
  return pin;
}

export function readNote(value) {
  const note = typeof value === 'string' ? value.trim() : '';
  if (note.length > 100) throw badRequest('Note must be at most 100 characters', { fields: { note: 'Too long' } });
  return note;
}

// Handles look like "apeksha@paylite". Users may type just "apeksha".
export function readHandle(value) {
  let handle = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (handle && !handle.includes('@')) handle = `${handle}@paylite`;
  if (!/^[a-z0-9._-]{3,30}@paylite$/.test(handle)) {
    throw badRequest('Enter a valid PayLite ID, like name@paylite', { fields: { to: 'Invalid PayLite ID' } });
  }
  return handle;
}
