import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { verifyWebhookSignature } from '../services/razorpay.js';
import { creditTopupOrder } from '../services/payments.js';

const router = Router();

// POST /api/webhooks/razorpay
//
// Razorpay calls this server-to-server when a payment is captured. It is the
// backup for the browser's /topup/verify call: if the user closes the tab
// right after paying, the wallet is still credited. The body arrives as raw
// bytes (see app.js) because the signature is computed over the exact bytes.
router.post(
  '/razorpay',
  asyncHandler(async (req, res) => {
    const signature = req.get('X-Razorpay-Signature');
    if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, signature)) {
      return res.status(400).json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid signature' } });
    }

    const event = JSON.parse(req.body.toString('utf8'));
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        try {
          await creditTopupOrder({ orderId: payment.order_id, paymentId: payment.id, amountPaise: payment.amount });
        } catch (err) {
          // Orders this app did not create (e.g. other projects on the same
          // Razorpay account) are acknowledged and ignored.
          if (err.code !== 'NOT_FOUND') throw err;
        }
      }
    }

    // A 2xx tells Razorpay to stop retrying. Duplicate deliveries are safe
    // because crediting an order only ever happens once.
    return res.json({ ok: true });
  }),
);

export default router;
