import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { buildQrPayload } from '../lib/qr';
import { AMOUNT_RE, formatINR } from '../lib/format';

// Shows a QR others can scan in PayLite to pay this user. Adding an amount
// makes a "fixed amount" QR, like a shop's billing QR.
export default function MyQr() {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [image, setImage] = useState('');

  const validAmount = AMOUNT_RE.test(amount) && Number(amount) > 0 ? amount : '';

  useEffect(() => {
    if (!user) return;
    const payload = buildQrPayload({ to: user.handle, name: user.name, amount: validAmount, note: note.trim() });
    QRCode.toDataURL(payload, { width: 320, margin: 2, color: { dark: '#172a5c' } })
      .then(setImage)
      .catch(() => setImage(''));
  }, [user, validAmount, note]);

  const toPaise = (text: string) => {
    const [r, p = ''] = text.split('.');
    return Number(r) * 100 + Number(p.padEnd(2, '0'));
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">My QR code</h1>
      <div className="card p-6 text-center">
        <p className="font-semibold">{user?.name}</p>
        <p className="text-sm text-slate-500">{user?.handle}</p>
        {image && <img src={image} alt={`QR code to pay ${user?.handle}`} className="mx-auto mt-4 h-64 w-64" />}
        {validAmount && <p className="mt-2 text-xl font-bold">{formatINR(toPaise(validAmount))}</p>}
        <p className="mt-2 text-xs text-slate-500">Scan with PayLite → Scan &amp; Pay</p>
        {image && (
          <a href={image} download={`paylite-${user?.handle}.png`} className="btn-secondary mt-4">
            <Download className="h-4 w-4" /> Download
          </a>
        )}
      </div>

      <div className="card space-y-3 p-6">
        <p className="text-sm font-medium text-slate-700">Ask for a fixed amount (optional)</p>
        <input
          className="input"
          inputMode="decimal"
          placeholder="Amount, e.g. 250"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
        />
        <input className="input" maxLength={100} placeholder="Note, e.g. Dinner" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </div>
  );
}
