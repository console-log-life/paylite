import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

export default function PinRequired() {
  return (
    <div className="card mx-auto max-w-md p-6 text-center">
      <KeyRound className="mx-auto h-10 w-10 text-brand-600" />
      <h2 className="mt-3 text-lg font-semibold">Set your PayLite PIN first</h2>
      <p className="mt-1 text-sm text-slate-500">Every payment is confirmed with a 4 to 6 digit PIN.</p>
      <Link to="/settings" className="btn-primary mt-4">
        Set PIN
      </Link>
    </div>
  );
}
