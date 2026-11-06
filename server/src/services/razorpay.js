import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

export const razorpayEnabled = () => Boolean(config.razorpayKeyId && config.razorpayKeySecret);

// Creates an order with Razorpay's Orders API. The amount is decided here, on
// the server; the browser only ever gets the order id, so it cannot change
// what will be charged.
export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  let res;
  try {
    res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
    });
  } catch {
    throw new AppError(502, 'GATEWAY_UNAVAILABLE', 'Payment gateway is not reachable. Try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Razorpay order failed', res.status, data);
    throw new AppError(502, 'GATEWAY_ERROR', 'Payment gateway rejected the order');
  }
  return data; // { id: "order_...", amount, currency, ... }
}

// Compares two hex signatures in constant time, so the time taken does not
// reveal how many leading characters were right.
function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// After checkout, Razorpay gives the browser a signature:
// HMAC-SHA256(order_id + "|" + payment_id, key_secret). Only Razorpay and
// this server know key_secret, so a matching signature proves the payment
// really happened for this order; the browser cannot fake it.
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', config.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

// Webhooks are signed over the exact raw request body with the webhook
// secret. The body must not be parsed and re-serialised before checking,
// because any change in spacing would change the signature.
export function verifyWebhookSignature(rawBody, signature) {
  if (!config.razorpayWebhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpayWebhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}
