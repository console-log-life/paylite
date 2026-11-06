import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Receipt } from '../lib/types';
import { AMOUNT_RE } from '../lib/format';
import ReceiptCard from '../components/ReceiptCard';

const QUICK = ['500', '1000', '2000', '5000'];

export default function AddMoney() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  if (receipt) return <ReceiptCard receipt={receipt} onDone={() => navigate('/')} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!AMOUNT_RE.test(amount)) {
      setError('Enter an amount like 500 or 500.50');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setReceipt(await api.topup(amount));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add money');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Add money</h1>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <Landmark className="h-5 w-5" />
          Demo bank account. In a real app this step would go through a payment gateway.
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
          />
        </div>
        <div className="flex gap-2">
          {QUICK.map((q) => (
            <button type="button" key={q} onClick={() => setAmount(q)} className="btn-secondary flex-1 px-2 py-1.5 text-xs">
              ₹{Number(q).toLocaleString('en-IN')}
            </button>
          ))}
        </div>
        {error && <p className="field-error text-sm">{error}</p>}
        <button disabled={busy} className="btn-primary w-full">
          {busy ? 'Adding…' : 'Add money'}
        </button>
        <p className="text-center text-xs text-slate-500">Up to ₹50,000 at a time.</p>
      </form>
    </div>
  );
}
