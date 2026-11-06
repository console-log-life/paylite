import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { HistoryItem } from '../lib/types';
import { todayLocal } from '../lib/format';
import ActivityList from '../components/ActivityList';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
];

function monthStart() {
  return `${todayLocal().slice(0, 7)}-01`;
}

export default function History() {
  const [direction, setDirection] = useState('');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayLocal());
  const [downloading, setDownloading] = useState(false);

  // First page for the current filter.
  const loadFirst = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.history({ limit: 20, direction });
      setItems(res.items);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load history');
    } finally {
      setLoading(false);
    }
  }, [direction]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  // Next page: ask for rows older than the last one we have.
  const loadMore = async () => {
    setLoading(true);
    try {
      const res = await api.history({ limit: 20, direction, cursor });
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load more');
    } finally {
      setLoading(false);
    }
  };

  // Re-label a payment. Updates the row straight away, and puts it back if
  // the server refuses.
  const changeCategory = async (item: HistoryItem, category: string) => {
    const previous = item.category;
    setItems((rows) => rows.map((r) => (r.id === item.id ? { ...r, category } : r)));
    try {
      await api.setCategory(item.id, category);
    } catch (err) {
      setItems((rows) => rows.map((r) => (r.id === item.id ? { ...r, category: previous } : r)));
      setError(err instanceof ApiError ? err.message : 'Could not change the category');
    }
  };

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      await api.downloadStatement(from, to);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not download the statement');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">History</h1>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label htmlFor="from" className="label">From</label>
          <input id="from" type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="to" className="label">To</label>
          <input id="to" type="date" className="input" value={to} min={from} max={todayLocal()} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={download} disabled={downloading || !from || !to} className="btn-secondary">
          <Download className="h-4 w-4" />
          {downloading ? 'Preparing…' : 'Download statement (CSV)'}
        </button>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setDirection(f.value)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${direction === f.value ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="card px-5">
        {loading && items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <ActivityList items={items} showBalance onCategoryChange={changeCategory} />
        )}
      </div>

      {cursor && (
        <button onClick={loadMore} disabled={loading} className="btn-secondary w-full">
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
