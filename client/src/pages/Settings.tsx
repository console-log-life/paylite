import { useState, type FormEvent } from 'react';
import { BadgeCheck, KeyRound, Scale } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import type { LedgerCheck } from '../lib/types';
import { formatINR } from '../lib/format';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [password, setPassword] = useState('');
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<LedgerCheck | null>(null);
  const [checkError, setCheckError] = useState('');

  const savePin = async (e: FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    if (!/^\d{4,6}$/.test(pin)) return setPinMsg({ ok: false, text: 'PIN must be 4 to 6 digits' });
    if (pin !== confirmPin) return setPinMsg({ ok: false, text: 'The two PINs do not match' });
    setBusy(true);
    try {
      await api.setPin({ pin, password });
      await refreshUser();
      setPin('');
      setConfirmPin('');
      setPassword('');
      setPinMsg({ ok: true, text: 'PIN saved' });
    } catch (err) {
      setPinMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save PIN' });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setCheckError('');
    try {
      setCheck(await api.verifyLedger());
    } catch (err) {
      setCheckError(err instanceof ApiError ? err.message : 'Check failed');
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="card p-6">
        <h2 className="font-semibold">Profile</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Name</dt><dd>{user?.name}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Email</dt><dd>{user?.email}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">PayLite ID</dt><dd className="font-medium">{user?.handle}</dd></div>
        </dl>
      </section>

      <form onSubmit={savePin} className="card space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4" /> {user?.hasPin ? 'Change PIN' : 'Set PIN'}
        </h2>
        <p className="text-sm text-slate-500">Asked on every payment. Three wrong tries lock it for 15 minutes.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pin" className="label">New PIN</label>
            <input id="pin" type="password" inputMode="numeric" maxLength={6} className="input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <label htmlFor="confirm" className="label">Confirm PIN</label>
            <input id="confirm" type="password" inputMode="numeric" maxLength={6} className="input" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <div>
          <label htmlFor="password" className="label">Account password</label>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {pinMsg && <p className={`text-sm ${pinMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{pinMsg.text}</p>}
        <button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save PIN'}</button>
      </form>

      <section className="card space-y-3 p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Scale className="h-4 w-4" /> Verify my balance
        </h2>
        <p className="text-sm text-slate-500">
          Your balance is stored for speed, and every rupee is also recorded in a ledger. This adds up all your ledger
          entries and checks the two agree.
        </p>
        <button onClick={verify} className="btn-secondary">Run check</button>
        {checkError && <p className="text-sm text-red-600">{checkError}</p>}
        {check && (
          <div className={`rounded-xl p-4 text-sm ${check.matches ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            <p className="flex items-center gap-2 font-semibold">
              <BadgeCheck className="h-4 w-4" /> {check.matches ? 'Balance matches the ledger' : 'Mismatch found'}
            </p>
            <p className="mt-1">
              Stored balance {formatINR(check.cachedBalancePaise)} · Ledger total {formatINR(check.ledgerBalancePaise)} · {check.entries} entries
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
