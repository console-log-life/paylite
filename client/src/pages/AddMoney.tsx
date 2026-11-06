import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { Receipt, Wallet } from '../lib/types';
import { AMOUNT_RE } from '../lib/format';
import { payWithRazorpay } from '../lib/razorpay';
import ReceiptCard from '../components/ReceiptCard';

const QUICK = ['500', '1000', '2000', '5000'];

export default function AddMoney() {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    api.wallet().then(setWallet).catch(() => {});
  }, []);

  if (receipt) return <ReceiptCard receipt={receipt} onDone={() => navigate('/')} />;

  const razorpay = wallet?.topupMode === 'razorpay';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!AMOUNT_RE.test(amount) || Number(amount) <= 0) {
      setError('Enter an amount like 500 or 500.50');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (razorpay) {
        // 1. The server creates the order (it decides the amount).
        const order = await api.topupOrder(amount);
        // 2. The user pays in Razorpay's checkout (UPI, card, netbanking).
        const paid = await payWithRazorpay(order);
        // 3. The server checks Razorpay's signature, then credits the wallet.
        setReceipt(await api.topupVerify(paid));
      } else {
        setReceipt(await api.topup(amount));
      }
    } catch (err) {
      // ApiError (from our server) and Error (from checkout) both carry a readable message.
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not add money');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Add money</h1>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          {razorpay ? <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Landmark className="mt-0.5 h-5 w-5 shrink-0" />}
          {razorpay ? (
            <span>
              Pay with UPI, card or netbanking through Razorpay (test mode). Use UPI ID <b>success@razorpay</b> or test
              card <b>4111 1111 1111 1111</b>; no real money is charged.
            </span>
          ) : (
            <span>Demo mode: money is added instantly from a pretend bank account.</span>
          )}
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
        <button disabled={busy || !wallet} className="btn-primary w-full">
          {busy ? 'Processing…' : razorpay ? 'Pay with Razorpay' : 'Add money'}
        </button>
        <p className="text-center text-xs text-slate-500">Up to ₹50,000 at a time.</p>
      </form>
    </div>
  );
}
