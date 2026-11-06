import { CheckCircle2 } from 'lucide-react';
import type { Receipt } from '../lib/types';
import { formatDateTime, formatINR } from '../lib/format';

export default function ReceiptCard({ receipt, onDone, doneLabel = 'Done' }: { receipt: Receipt; onDone: () => void; doneLabel?: string }) {
  const t = receipt.transaction;
  const title = t.type === 'topup' ? 'Money added' : 'Payment successful';
  return (
    <div className="card mx-auto max-w-md p-6 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
      <p className="mt-3 text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-bold">{formatINR(t.amountPaise)}</p>
      {t.type !== 'topup' && (
        <p className="mt-1 text-slate-700">
          to <span className="font-semibold">{t.counterparty.name}</span>{' '}
          <span className="text-slate-500">({t.counterparty.handle})</span>
        </p>
      )}
      {t.note && <p className="mt-2 text-sm italic text-slate-500">“{t.note}”</p>}

      <dl className="mt-5 space-y-2 rounded-xl bg-slate-50 p-4 text-left text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Reference</dt>
          <dd className="font-mono font-medium">{t.reference}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Time</dt>
          <dd>{formatDateTime(t.createdAt)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Balance now</dt>
          <dd className="font-medium">{formatINR(receipt.balancePaise)}</dd>
        </div>
      </dl>

      <button onClick={onDone} className="btn-primary mt-5 w-full">
        {doneLabel}
      </button>
    </div>
  );
}
