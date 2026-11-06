import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, Zap, BookOpenCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { user, login, register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else setError('Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-900 p-10 text-white md:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-bold text-brand-700">₹</div>
          <span className="text-xl font-bold">PayLite</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold leading-tight">Send money in seconds. Never twice by mistake.</h1>
          <ul className="space-y-4 text-brand-100">
            <li className="flex gap-3">
              <BookOpenCheck className="h-5 w-5 shrink-0" /> Every rupee is tracked in a double-entry ledger.
            </li>
            <li className="flex gap-3">
              <Zap className="h-5 w-5 shrink-0" /> Retries are safe: a payment is never charged twice.
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0" /> PIN on every payment, with daily and per-payment limits.
            </li>
          </ul>
        </div>
        <p className="text-xs text-brand-100/70">A demo wallet. No real money moves.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-2xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your wallet'}</h2>
            <p className="text-sm text-slate-500">
              {mode === 'login' ? 'Log in to PayLite' : 'You get a PayLite ID like name@paylite'}
            </p>
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="name" className="label">Full name</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              {fields.name && <p className="field-error">{fields.name}</p>}
            </div>
          )}
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {fields.email && <p className="field-error">{fields.email}</p>}
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            {fields.password && <p className="field-error">{fields.password}</p>}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>

          <p className="text-center text-sm text-slate-600">
            {mode === 'login' ? (
              <>New here? <Link className="font-medium text-brand-600" to="/signup">Create an account</Link></>
            ) : (
              <>Already have an account? <Link className="font-medium text-brand-600" to="/login">Log in</Link></>
            )}
          </p>
          <p className="text-center text-xs text-slate-400">The first request can take ~30 s while the free server wakes up.</p>
        </form>
      </div>
    </div>
  );
}
