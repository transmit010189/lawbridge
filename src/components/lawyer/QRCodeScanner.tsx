"use client";

import { useEffect, useMemo, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { Copy, ExternalLink, QrCode, RefreshCw, X } from "lucide-react";

interface ParsedQrPayload {
  raw: string;
  kind: "url" | "consultation" | "wallet" | "text";
  consultationId?: string;
  walletTxnId?: string;
  url?: string;
}

function parseQrPayload(value: string): ParsedQrPayload {
  const raw = value.trim();

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.consultationId === "string") {
      return {
        raw,
        kind: "consultation",
        consultationId: parsed.consultationId,
      };
    }

    if (typeof parsed.walletTxnId === "string") {
      return {
        raw,
        kind: "wallet",
        walletTxnId: parsed.walletTxnId,
      };
    }
  } catch {
    // fall through
  }

  if (/^https?:\/\//i.test(raw)) {
    return { raw, kind: "url", url: raw };
  }

  const consultMatch = raw.match(/consultation(Id)?=([\w-]+)/i);
  if (consultMatch?.[2]) {
    return {
      raw,
      kind: "consultation",
      consultationId: consultMatch[2],
    };
  }

  const walletMatch = raw.match(/wallet(Txn)?=([\w-]+)/i);
  if (walletMatch?.[2]) {
    return {
      raw,
      kind: "wallet",
      walletTxnId: walletMatch[2],
    };
  }

  return { raw, kind: "text" };
}

export function QRCodeScanner() {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ParsedQrPayload | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (!scanning) {
      return;
    }

    let scanner: Html5QrcodeScanner | null = null;
    const timer = setTimeout(() => {
      scanner = new Html5QrcodeScanner(
        "lawbridge-mobile-scanner",
        {
          fps: 10,
          qrbox: { width: 260, height: 260 },
          rememberLastUsedCamera: true,
        },
        false
      );

      scanner.render(
        (decodedText) => {
          if (navigator.vibrate) {
            navigator.vibrate(90);
          }
          setResult(parseQrPayload(decodedText));
          void scanner?.clear();
          setScanning(false);
        },
        () => {
          // Ignore noisy scan attempts.
        }
      );
    }, 120);

    return () => {
      clearTimeout(timer);
      void scanner?.clear().catch(() => {});
    };
  }, [scanning]);

  const actionLabel = useMemo(() => {
    if (!result) {
      return "";
    }

    switch (result.kind) {
      case "url":
        return "打開連結";
      case "consultation":
        return "前往案件";
      case "wallet":
        return "查看交易";
      default:
        return "複製內容";
    }
  }, [result]);

  const handlePrimaryAction = () => {
    if (!result) {
      return;
    }

    if (result.kind === "url" && result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
      return;
    }

    const nextUrl = new URL(window.location.href);
    if (result.kind === "consultation" && result.consultationId) {
      nextUrl.searchParams.set("tab", "profile");
      nextUrl.searchParams.set("consultationId", result.consultationId);
      window.location.href = nextUrl.toString();
      return;
    }

    if (result.kind === "wallet" && result.walletTxnId) {
      nextUrl.searchParams.set("tab", "wallet");
      nextUrl.searchParams.set("walletTxnId", result.walletTxnId);
      window.location.href = nextUrl.toString();
      return;
    }

    void navigator.clipboard.writeText(result.raw);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1400);
  };

  return (
    <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">手機掃描 QR Code</h3>
          <p className="mt-1 text-sm leading-7 text-slate-500">
            可用於掃描案件 QR、付款代碼或平台連結。掃描後會自動解析可執行動作。
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          Mobile ready
        </div>
      </div>

      {!scanning && !result ? (
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-[1.2rem] bg-[var(--brand-gold)] px-4 py-3 text-sm font-medium text-slate-900 transition hover:bg-yellow-400"
        >
          <QrCode className="h-4 w-4" />
          啟動相機
        </button>
      ) : null}

      {scanning ? (
        <div className="mt-5">
          <div
            id="lawbridge-mobile-scanner"
            className="w-full max-w-sm overflow-hidden rounded-[1.4rem] border border-slate-200 bg-black"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="inline-flex items-center gap-2 rounded-[1.2rem] bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              <X className="h-4 w-4" />
              取消
            </button>
            <p className="text-xs text-slate-500">
              建議使用手機主鏡頭，並把 QR 放在取景框中央。
            </p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 rounded-[1.6rem] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-600">Scan result</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-[1.2rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs text-slate-400">解析類型</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {result.kind === "url"
                  ? "平台連結"
                  : result.kind === "consultation"
                    ? "案件 QR"
                    : result.kind === "wallet"
                      ? "交易 QR"
                      : "一般文字"}
              </p>
              <p className="mt-3 break-all font-mono text-xs leading-6 text-slate-600">
                {result.raw}
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handlePrimaryAction}
                className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                {result.kind === "url" ? <ExternalLink className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copyState === "copied" ? "已複製" : actionLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setScanning(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                <RefreshCw className="h-4 w-4" />
                再掃一次
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
