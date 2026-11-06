import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Send, HandCoins, PlusCircle, Copy, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import type { HistoryItem, PaymentRequest, Wallet } from '../lib/types';
import { formatINR } from '../lib/format';
import ActivityList from '../components/ActivityList';

export default function Home() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [incoming, setIncoming] = useState<PaymentRequest[]>([]);
  const [showBalance, setShowBalance] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [w, h, r] = await Promise.all([api.wallet(), api.history({ limit: 5 }), api.requests('incoming')]);
      setWallet(w);
      setRecent(h.items);
      setIncoming(r.items.filter((x) => x.status === 'pending'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your wallet');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user!.handle);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const usedPercent = wallet ? Math.min(100, (wallet.limits.sentTodayPaise / wallet.limits.dailySendPaise) * 100) : 0;

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 p-6 text-white shadow-lg md:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-100">Hi {user?.name.split(' ')[0]}, your balance</p>
            <button onClick={copyId} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {user?.handle}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <p className="text-4xl font-bold tracking-tight">
              {wallet ? (showBalance ? formatINR(wallet.balancePaise) : '₹ ••••••') : '…'}
            </p>
            <button
              onClick={() => setShowBalance((s) => !s)}
              className="rounded-full p-2 hover:bg-white/10"
              aria-label={showBalance ? 'Hide balance' : 'Show balance'}
            >
              {showBalance ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Link to="/send" className="flex flex-col items-center gap-1 rounded-xl bg-white/10 py-3 text-sm font-medium hover:bg-white/20">
              <Send className="h-5 w-5" /> Send
            </Link>
            <Link to="/request" className="flex flex-col items-center gap-1 rounded-xl bg-white/10 py-3 text-sm font-medium hover:bg-white/20">
              <HandCoins className="h-5 w-5" /> Request
            </Link>
            <Link to="/add-money" className="flex flex-col items-center gap-1 rounded-xl bg-white/10 py-3 text-sm font-medium hover:bg-white/20">
              <PlusCircle className="h-5 w-5" /> Add money
            </Link>
          </div>
        </div>

        <div className="card p-5">
          <p className="text-sm font-medium text-slate-500">Sent today</p>
          <p className="mt-1 text-2xl font-bold">{wallet ? formatINR(wallet.limits.sentTodayPaise) : '…'}</p>
          <div className="mt-3 h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${usedPercent}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {wallet && `${formatINR(wallet.limits.remainingTodayPaise)} left of ${formatINR(wallet.limits.dailySendPaise)} daily limit`}
          </p>
          <p className="mt-3 text-xs text-slate-500">
            {wallet && `Up to ${formatINR(wallet.limits.maxTransferPaise)} per payment. Resets at midnight IST.`}
          </p>
        </div>
      </section>

      {!user?.hasPin && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>Set a PayLite PIN to start sending money.</span>
          <Link to="/settings" className="font-semibold underline">Set PIN</Link>
        </div>
      )}

      {incoming.length > 0 && (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Waiting for you to pay</h2>
            <Link to="/requests" className="text-sm font-medium text-brand-600">View all</Link>
          </div>
          <ul className="mt-2 divide-y divide-slate-100">
            {incoming.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                <span>
                  <span className="font-medium">{r.counterparty?.name}</span> requested {r.note && <span className="text-slate-500">for “{r.note}”</span>}
                </span>
                <span className="font-semibold">{formatINR(r.amountPaise)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent activity</h2>
          <Link to="/history" className="text-sm font-medium text-brand-600">See all</Link>
        </div>
        <ActivityList items={recent} />
      </section>
    </div>
  );
}
