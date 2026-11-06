import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Lock, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { formatINR } from '../lib/format';

interface PinSheetProps {
  amountPaise: number;
  payeeName: string;
  // Runs the payment with the PIN. Throws ApiError on failure.
  onConfirm: (pin: string) => Promise<void>;
  onClose: () => void;
}

// The "enter UPI PIN" step. Shows how many tries are left after a wrong PIN,
// and the lock message after three.
export default function PinSheet({ amountPaise, payeeName, onConfirm, onClose }: PinSheetProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError('Enter your 4 to 6 digit PIN');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(pin);
    } catch (err) {
      setPin('');
      if (err instanceof ApiError && err.code === 'WRONG_PIN') {
        const left = err.extra.attemptsLeft as number;
        setError(`Incorrect PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
      } else {
        setError(err instanceof ApiError ? err.message : 'Payment failed');
      }
      input.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">Paying {payeeName}</p>
            <p className="text-2xl font-bold">{formatINR(amountPaise)}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Cancel">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label htmlFor="pin" className="label flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" /> Enter PayLite PIN
        </label>
        <input
          ref={input}
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="input text-center text-2xl tracking-[0.5em]"
        />
        {error && <p className="field-error text-sm">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary mt-4 w-full">
          {busy ? 'Processing…' : `Pay ${formatINR(amountPaise)}`}
        </button>
      </form>
    </div>
  );
}
