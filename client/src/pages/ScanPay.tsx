import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ImageUp, ScanLine } from 'lucide-react';
import { parseQrPayload } from '../lib/qr';

const READER_ID = 'qr-reader';

// Scans a PayLite QR with the camera (or from a screenshot) and opens the
// Send screen with the ID, amount and note filled in. The user still sees
// the payee's name and enters their PIN before anything is paid.
export default function ScanPay() {
  const navigate = useNavigate();
  const scanner = useRef<Html5Qrcode | null>(null);
  const handled = useRef(false);
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(false);

  const handleText = (text: string) => {
    if (handled.current) return;
    const payment = parseQrPayload(text);
    if (!payment) {
      setError('This is not a PayLite QR code.');
      return;
    }
    handled.current = true;
    const params = new URLSearchParams({ to: payment.to });
    if (payment.amount) params.set('amount', payment.amount);
    if (payment.note) params.set('note', payment.note);
    navigate(`/send?${params}`);
  };

  useEffect(() => {
    const qr = new Html5Qrcode(READER_ID);
    scanner.current = qr;
    qr.start({ facingMode: 'environment' }, { fps: 10, qrbox: 230 }, handleText, () => {})
      .then(() => setCameraOn(true))
      .catch(() => setError('Camera not available. You can upload a screenshot of the QR instead.'));
    return () => {
      if (qr.isScanning) qr.stop().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanFile = async (file: File | undefined) => {
    if (!file || !scanner.current) return;
    setError('');
    try {
      if (scanner.current.isScanning) await scanner.current.stop();
      setCameraOn(false);
      handleText(await scanner.current.scanFile(file, false));
    } catch {
      setError('No QR code found in that image.');
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <ScanLine className="h-6 w-6" /> Scan &amp; Pay
      </h1>
      <div className="card overflow-hidden p-3">
        <div id={READER_ID} className="min-h-[260px] w-full overflow-hidden rounded-xl bg-slate-900" />
        {!cameraOn && !error && <p className="py-2 text-center text-sm text-slate-500">Starting camera…</p>}
      </div>
      {error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>}
      <label className="btn-secondary w-full cursor-pointer">
        <ImageUp className="h-4 w-4" /> Upload QR image
        <input type="file" accept="image/*" className="hidden" onChange={(e) => scanFile(e.target.files?.[0])} />
      </label>
    </div>
  );
}
