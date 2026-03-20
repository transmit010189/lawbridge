"use client";

import { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QrCode, X } from "lucide-react";

export function QRCodeScanner() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;

    let scanner: Html5QrcodeScanner;
    
    // Give DOM a tick to render element
    const timer = setTimeout(() => {
       scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
       scanner.render(
         (text) => {
           setResult(text);
           scanner?.clear();
           setScanning(false);
         },
         () => {
           // Ignore scan fail noises
         }
       );
    }, 100);

    return () => {
      clearTimeout(timer);
      if (scanner) scanner.clear().catch(console.error);
    };
  }, [scanning]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">手機掃描 QR Code (Mobile Scanner)</h3>
      <p className="mt-1 text-sm text-slate-500">掃描客戶委託書、快速綁定或是調閱案件資訊。(Scan client documents, payments, or connect cases.)</p>

      {!scanning && !result ? (
        <button
          onClick={() => setScanning(true)}
          className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--brand-gold)] px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-yellow-500"
        >
          <QrCode className="h-4 w-4" />
          啟動相機 (Start Scanner)
        </button>
      ) : scanning ? (
        <div className="mt-4">
          <div id="reader" className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-black" />
          <button
            onClick={() => setScanning(false)}
            className="mt-4 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
            取消 (Cancel)
          </button>
        </div>
      ) : result ? (
        <div className="mt-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Scan Result / 掃描結果</p>
            <p className="mt-1 break-all text-sm font-mono text-slate-800">{result}</p>
          </div>
          <button
             onClick={() => { setResult(null); setScanning(true); }}
             className="mt-4 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition"
          >
            再次掃描 (Scan Again)
          </button>
        </div>
      ) : null}
    </div>
  );
}
