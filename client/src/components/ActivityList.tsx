import { ArrowDownLeft, ArrowUpRight, Landmark } from 'lucide-react';
import { CATEGORY_ICONS, EXPENSE_CATEGORIES, type HistoryItem } from '../lib/types';
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

interface ActivityListProps {
  items: HistoryItem[];
  showBalance?: boolean;
  // When given, payments you made get a category dropdown.
  onCategoryChange?: (item: HistoryItem, category: string) => void;
}

export default function ActivityList({ items, showBalance = false, onCategoryChange }: ActivityListProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No transactions yet.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((item) => {
        const sent = item.direction === 'sent';
        const label =
          item.type === 'topup' ? 'Added money' : sent ? `Paid to ${item.counterparty.name}` : `Received from ${item.counterparty.name}`;
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
              <div className="mt-0.5 flex items-center gap-2">
                {sent && onCategoryChange ? (
                  <select
                    aria-label="Category"
                    value={item.category || 'Other'}
                    onChange={(e) => onCategoryChange(item, e.target.value)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_ICONS[c]} {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  item.category && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {CATEGORY_ICONS[item.category] ?? ''} {item.category}
                    </span>
                  )
                )}
                <span className="font-mono text-[11px] text-slate-400">{item.reference}</span>
              </div>
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
