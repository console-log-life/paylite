import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import type { PaymentRequest, Receipt } from '../lib/types';
import { formatDate, formatINR, initials } from '../lib/format';
import PinSheet from '../components/PinSheet';
import ReceiptCard from '../components/ReceiptCard';

const STATUS_STYLE: Record<PaymentRequest['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
  declined: 'bg-red-50 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
  expired: 'bg-slate-100 text-slate-600',
};

export default function Requests() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const box = params.get('box') === 'outgoing' ? 'outgoing' : 'incoming';
  const [items, setItems] = useState<PaymentRequest[] | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState<PaymentRequest | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setItems((await api.requests(box)).items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load requests');
    }
  }, [box]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    }
  };

  const pay = async (pin: string) => {
    const res = await api.payRequest(paying!.id, pin);
    setPaying(null);
    setReceipt(res);
  };

  if (receipt) {
    return (
      <ReceiptCard
        receipt={receipt}
        doneLabel="Back to requests"
        onDone={() => {
          setReceipt(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Requests</h1>
        <Link to="/request" className="btn-primary">Request money</Link>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {(['incoming', 'outgoing'] as const).map((b) => (
          <button
            key={b}
            onClick={() => setParams({ box: b })}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${box === b ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {b === 'incoming' ? 'To pay' : 'Sent by me'}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card divide-y divide-slate-100">
        {items === null && <p className="p-6 text-center text-sm text-slate-500">Loading…</p>}
        {items?.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            {box === 'incoming' ? 'Nobody has asked you for money.' : 'You have not requested money yet.'}
          </p>
        )}
        {items?.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials(r.counterparty?.name || '?')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {box === 'incoming' ? `${r.counterparty?.name} asked you` : `You asked ${r.counterparty?.name}`}
              </p>
              <p className="text-xs text-slate-500">
                {r.note && `“${r.note}” · `}
                {formatDate(r.createdAt)}
                {r.status === 'pending' && ` · expires ${formatDate(r.expiresAt)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatINR(r.amountPaise)}</p>
              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[r.status]}`}>
                {r.status}
              </span>
            </div>
            {r.status === 'pending' && (
              <div className="flex w-full gap-2 sm:w-auto">
                {box === 'incoming' ? (
                  <>
                    <button className="btn-danger flex-1 py-1.5" onClick={() => act(() => api.declineRequest(r.id))}>Decline</button>
                    <button
                      className="btn-primary flex-1 py-1.5"
                      disabled={!user?.hasPin}
                      title={user?.hasPin ? '' : 'Set a PIN in Settings first'}
                      onClick={() => setPaying(r)}
                    >
                      Pay
                    </button>
                  </>
                ) : (
                  <button className="btn-secondary flex-1 py-1.5" onClick={() => act(() => api.cancelRequest(r.id))}>Cancel</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {paying && (
        <PinSheet
          amountPaise={paying.amountPaise}
          payeeName={paying.counterparty?.name || ''}
          onConfirm={pay}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
