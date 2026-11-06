import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { CATEGORY_ICONS, EXPENSE_CATEGORIES, type Insights as InsightsData } from '../lib/types';
import { AMOUNT_RE, formatINR, initials, todayLocal } from '../lib/format';

const COLORS = ['#2554e8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#64748b', '#14b8a6', '#a855f7'];
const BAR = { ok: 'bg-emerald-500', warning: 'bg-amber-500', exceeded: 'bg-red-500' };

const monthLabel = (month: string, style: 'short' | 'long' = 'short') => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: style, year: 'numeric', timeZone: 'UTC' });
};
const shortINR = (paise: number) => {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(1)}K`;
  return `₹${r.toFixed(0)}`;
};

// Spending report built from your PayLite payments: every payment is already
// categorised, so nothing has to be entered twice.
export default function Insights() {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState('');
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetError, setBudgetError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api.insights(month));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load insights');
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const saveBudget = async (e: FormEvent) => {
    e.preventDefault();
    setBudgetError('');
    if (!budgetCategory) return setBudgetError('Choose a category');
    if (!AMOUNT_RE.test(budgetAmount) || Number(budgetAmount) <= 0) return setBudgetError('Enter an amount');
    try {
      await api.saveBudget({ category: budgetCategory, month, amount: budgetAmount });
      setBudgetCategory('');
      setBudgetAmount('');
      await load();
    } catch (err) {
      setBudgetError(err instanceof ApiError ? err.message : 'Could not save');
    }
  };

  const removeBudget = async (id: string) => {
    try {
      await api.deleteBudget(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete');
    }
  };

  const pieData = data?.byCategory.map((c) => ({ name: c.category, value: c.totalPaise })) ?? [];
  const trendData = data?.trend.map((t) => ({ month: monthLabel(t.month), Spent: t.spentPaise, Received: t.receivedPaise })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-sm text-slate-500">Where your money went, from your PayLite payments</p>
        </div>
        <input type="month" className="input w-44" value={month} max={todayLocal().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {data && data.alerts.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Budget alerts
          </p>
          <ul className="mt-1 space-y-0.5">
            {data.alerts.map((a) => (
              <li key={a.id}>
                {CATEGORY_ICONS[a.category]} {a.category}:{' '}
                {a.status === 'exceeded' ? `over by ${formatINR(-a.remainingPaise)} (${a.percentUsed}%)` : `${a.percentUsed}% used, ${formatINR(a.remainingPaise)} left`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-sm text-slate-500">Spent in {monthLabel(month, 'long')}</p>
          <p className="mt-1 text-2xl font-bold">{data ? formatINR(data.spentPaise) : '…'}</p>
          {data?.spentChangePercent != null && (
            <p className={`mt-1 text-xs ${data.spentChangePercent > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {data.spentChangePercent > 0 ? '+' : ''}
              {data.spentChangePercent}% vs last month
            </p>
          )}
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Received</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{data ? formatINR(data.receivedPaise) : '…'}</p>
          <p className="mt-1 text-xs text-slate-500">From other people (top-ups not counted)</p>
        </div>
        <div className="card p-5">
          <p className="text-sm text-slate-500">Biggest category</p>
          <p className="mt-1 text-2xl font-bold">
            {data?.byCategory[0] ? `${CATEGORY_ICONS[data.byCategory[0].category] ?? ''} ${data.byCategory[0].category}` : '—'}
          </p>
          {data?.byCategory[0] && <p className="mt-1 text-xs text-slate-500">{formatINR(data.byCategory[0].totalPaise)}</p>}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">By category</h2>
          {pieData.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">No payments this month.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {pieData.map((d, i) => (
                      <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Last 6 months</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={shortINR} width={52} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Legend />
                <Bar dataKey="Spent" fill="#2554e8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Received" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">Budgets · {monthLabel(month, 'long')}</h2>
          <p className="text-xs text-slate-500">You get an alert at 80% of a budget.</p>
          <div className="mt-4 space-y-4">
            {data?.budgets.length === 0 && <p className="text-sm text-slate-500">No budgets yet.</p>}
            {data?.budgets.map((b) => (
              <div key={b.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {CATEGORY_ICONS[b.category]} {b.category}
                  </span>
                  <span className="flex items-center gap-2">
                    {formatINR(b.spentPaise)} / {formatINR(b.amountPaise)}
                    <button onClick={() => removeBudget(b.id)} className="text-slate-400 hover:text-red-600" aria-label={`Delete ${b.category} budget`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${BAR[b.status]}`} style={{ width: `${Math.min(b.percentUsed, 100)}%` }} />
                </div>
                <p className={`mt-0.5 text-xs ${b.status === 'exceeded' ? 'text-red-600' : 'text-slate-500'}`}>
                  {b.percentUsed}% used · {b.remainingPaise >= 0 ? `${formatINR(b.remainingPaise)} left` : `${formatINR(-b.remainingPaise)} over`}
                </p>
              </div>
            ))}
          </div>

          <form onSubmit={saveBudget} className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <select className="input flex-1" value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)} aria-label="Budget category">
              <option value="">Category…</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_ICONS[c]} {c}
                </option>
              ))}
            </select>
            <input
              className="input w-32"
              inputMode="decimal"
              placeholder="₹ amount"
              aria-label="Budget amount"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
            <button className="btn-primary">
              <Plus className="h-4 w-4" /> Set
            </button>
            {budgetError && <p className="field-error w-full">{budgetError}</p>}
          </form>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Who you paid most</h2>
          {data?.topPayees.length === 0 && <p className="py-6 text-sm text-slate-500">No payments this month.</p>}
          <ul className="mt-2 divide-y divide-slate-100">
            {data?.topPayees.map((p) => (
              <li key={p.handle ?? p.name} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {initials(p.name)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.count} payment{p.count === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="font-semibold">{formatINR(p.totalPaise)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
