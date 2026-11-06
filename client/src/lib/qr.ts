// PayLite QR codes use the same idea as UPI QR codes ("upi://pay?pa=...")
// with their own scheme, so a real UPI app will not try to pay them:
//   paylite://pay?pa=ravi@paylite&pn=Ravi%20Kumar&am=250.00&tn=Dinner
// pa = PayLite ID (required), pn = name, am = amount, tn = note.

export interface QrPayment {
  to: string;
  name?: string;
  amount?: string;
  note?: string;
}

export function buildQrPayload({ to, name, amount, note }: QrPayment) {
  const params = new URLSearchParams({ pa: to });
  if (name) params.set('pn', name);
  if (amount) params.set('am', amount);
  if (note) params.set('tn', note);
  return `paylite://pay?${params}`;
}

// Returns the payment details, or null if this is not a PayLite QR.
// Everything read from a QR is untrusted: the ID is checked with a lookup
// and the amount is validated again before paying.
export function parseQrPayload(text: string): QrPayment | null {
  const trimmed = text.trim();
  if (!trimmed.toLowerCase().startsWith('paylite://pay?')) return null;
  const params = new URLSearchParams(trimmed.slice(trimmed.indexOf('?') + 1));
  const to = params.get('pa')?.trim().toLowerCase();
  if (!to || !/^[a-z0-9._-]{3,30}@paylite$/.test(to)) return null;
  const amount = params.get('am') || undefined;
  return {
    to,
    name: params.get('pn') || undefined,
    amount: amount && /^\d{1,9}(\.\d{1,2})?$/.test(amount) ? amount : undefined,
    note: params.get('tn')?.slice(0, 100) || undefined,
  };
}
