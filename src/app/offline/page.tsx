"use client";

import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="brand-surface w-full max-w-xl rounded-[2rem] px-6 py-8 text-center sm:px-8">
        <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
          LawBridge Offline
        </p>
        <h1 className="brand-title mt-4 text-3xl text-slate-900">
          目前離線，稍後再回到 LawBridge
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          網路連線已中斷。請在重新連線後回到首頁，繼續查看法規問答、律師資料與你的帳戶資訊。
        </p>
        <p className="mt-4 text-sm leading-7 text-slate-500">
          You are offline right now. Reconnect to continue browsing legal answers,
          lawyer profiles, and wallet activity.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-[1.2rem] bg-[var(--brand-ink)] px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            回到首頁
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-[1.2rem] border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            重新整理
          </button>
        </div>
      </div>
    </div>
  );
}
