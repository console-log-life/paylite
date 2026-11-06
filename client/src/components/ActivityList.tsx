import { ArrowDownLeft, ArrowUpRight, Landmark } from 'lucide-react';
import type { HistoryItem } from '../lib/types';
import { formatDateTime, formatINR, initials } from '../lib/format';

function Avatar({ item }: { item: HistoryItem }) {
  if (item.type === 'topup') {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Landmark className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
      {initials(item.counterparty.name)}
    </div>
  );
}

export default function ActivityList({ items, showBalance = false }: { items: HistoryItem[]; showBalance?: boolean }) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No transactions yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const sent = item.direction === 'sent';
        const label =
          item.type === 'topup' ? 'Added from bank' : sent ? `Paid to ${item.counterparty.name}` : `Received from ${item.counterparty.name}`;
        return (
          <li key={item.id} className="flex items-center gap-3 py-3">
            <Avatar item={item} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{label}</p>
              <p className="truncate text-xs text-slate-500">
                {formatDateTime(item.createdAt)}
                {item.note && ` · ${item.note}`}
                {item.type === 'request_payment' && ' · request'}
              </p>
              <p className="font-mono text-[11px] text-slate-400">{item.reference}</p>
            </div>
            <div className="text-right">
              <p className={`flex items-center justify-end gap-1 font-semibold ${sent ? 'text-slate-900' : 'text-emerald-600'}`}>
                {sent ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                {sent ? '-' : '+'}
                {formatINR(item.amountPaise)}
              </p>
              {showBalance && <p className="text-xs text-slate-400">Bal {formatINR(item.balanceAfterPaise)}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
