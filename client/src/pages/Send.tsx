import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import type { Receipt } from '../lib/types';
import { AMOUNT_RE } from '../lib/format';
import PinSheet from '../components/PinSheet';
import ReceiptCard from '../components/ReceiptCard';
import PinRequired from '../components/PinRequired';

interface Payee {
  name: string;
  handle: string;
}

// "250.5" -> 25050, only to show the amount on the PIN screen. The server
// does its own conversion and validation.
const toPaise = (text: string) => {
  const [r, p = ''] = text.split('.');
  return Number(r) * 100 + Number(p.padEnd(2, '0'));
};

export default function Send() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [to, setTo] = useState(params.get('to') || '');
  const [payee, setPayee] = useState<Payee | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  if (!user?.hasPin) return <PinRequired />;
  if (receipt) return <ReceiptCard receipt={receipt} onDone={() => navigate('/')} />;

  // Step 1: find the person and show their name before any money is involved.
  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setChecking(true);
    try {
      const res = await api.lookup(to);
      if (res.isSelf) setError('That is your own PayLite ID');
      else setPayee({ name: res.name, handle: res.handle });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Lookup failed');
    } finally {
      setChecking(false);
    }
  };

  // Step 2: amount and note, then the PIN sheet.
  const review = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!AMOUNT_RE.test(amount) || toPaise(amount) <= 0) {
      setError('Enter an amount like 250 or 250.50');
      return;
    }
    setAskPin(true);
  };

  const pay = async (pin: string) => {
    const res = await api.transfer({ to: payee!.handle, amount, note, pin });
    setAskPin(false);
    setReceipt(res);
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Send money</h1>

      {!payee ? (
        <form onSubmit={lookup} className="card space-y-4 p-6">
          <div>
            <label htmlFor="to" className="label">PayLite ID</label>
            <input id="to" className="input" placeholder="name@paylite" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" />
          </div>
          {error && <p className="field-error text-sm">{error}</p>}
          <button disabled={checking || !to.trim()} className="btn-primary w-full">
            {checking ? 'Checking…' : 'Continue'}
          </button>
        </form>
      ) : (
        <form onSubmit={review} className="card space-y-4 p-6">
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-semibold">{payee.name}</p>
              <p className="text-xs text-slate-500">{payee.handle}</p>
            </div>
            <button type="button" className="text-sm font-medium text-brand-600" onClick={() => setPayee(null)}>
              Change
            </button>
          </div>
          <div>
            <label htmlFor="amount" className="label">Amount (₹)</label>
            <input
              id="amount"
              inputMode="decimal"
              className="input text-2xl font-semibold"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="note" className="label">Note (optional)</label>
            <input id="note" className="input" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Dinner, rent…" />
          </div>
          {error && <p className="field-error text-sm">{error}</p>}
          <button className="btn-primary w-full">Proceed to pay</button>
        </form>
      )}

      {askPin && payee && (
        <PinSheet amountPaise={toPaise(amount)} payeeName={payee.name} onConfirm={pay} onClose={() => setAskPin(false)} />
      )}
    </div>
  );
}
