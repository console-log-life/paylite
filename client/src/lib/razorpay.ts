import type { TopupOrder } from './types';

// Razorpay Checkout is a script Razorpay hosts. It is loaded only when the
// user opens "Add money", not on every page.
const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (res: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Razorpay. Check your connection.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

// Opens the checkout and resolves with what Razorpay returns after payment.
// The server must still verify the signature; this result alone proves nothing.
export async function payWithRazorpay(order: TopupOrder): Promise<{ orderId: string; paymentId: string; signature: string }> {
  await loadScript();
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: 'PayLite',
      description: 'Add money to wallet',
      prefill: order.prefill,
      theme: { color: '#2554e8' },
      handler: (res: RazorpayResponse) =>
        resolve({ orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature }),
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    checkout.on('payment.failed', (res) => reject(new Error(res.error?.description || 'Payment failed')));
    checkout.open();
  });
}
