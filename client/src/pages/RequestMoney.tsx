import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { PaymentRequest } from '../lib/types';
import { AMOUNT_RE, formatINR } from '../lib/format';

export default function RequestMoney() {
  const [from, setFrom] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<PaymentRequest | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!AMOUNT_RE.test(amount)) {
      setError('Enter an amount like 250 or 250.50');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createRequest({ from, amount, note });
      setCreated(res.request);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the request');
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="card mx-auto max-w-md p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <p className="mt-3 text-lg font-semibold">Request sent</p>
        <p className="text-slate-600">
          You asked {created.counterparty?.name} for {formatINR(created.amountPaise)}. It expires in 7 days.
        </p>
        <div className="mt-5 flex gap-2">
          <Link to="/requests?box=outgoing" className="btn-secondary flex-1">View requests</Link>
          <button className="btn-primary flex-1" onClick={() => { setCreated(null); setAmount(''); setNote(''); setFrom(''); }}>
            New request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Request money</h1>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <label htmlFor="from" className="label">Ask from (PayLite ID)</label>
          <input id="from" className="input" placeholder="name@paylite" value={from} onChange={(e) => setFrom(e.target.value)} />
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
        <div>
          <label htmlFor="note" className="label">What is it for?</label>
          <input id="note" className="input" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Movie tickets" />
        </div>
        {error && <p className="field-error text-sm">{error}</p>}
        <button disabled={busy || !from.trim()} className="btn-primary w-full">
          {busy ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </div>
  );
}
