"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins, Sparkles, Wallet } from "lucide-react";
import type { SupportedLocale } from "@/types";

interface Props {
  earnedPoints: number;
  durationSec: number;
  locale: SupportedLocale;
  onClose: () => void;
  onViewWallet: () => void;
}

function formatDuration(durationSec: number, locale: SupportedLocale) {
  const minutes = Math.max(1, Math.ceil(durationSec / 60));
  return locale === "zh-TW" ? `${minutes} 分鐘` : `${minutes} min`;
}

export function LawyerPayoutCelebration({
  earnedPoints,
  durationSec,
  locale,
  onClose,
  onViewWallet,
}: Props) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const duration = 900;

    const frame = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      setDisplayValue(Math.round(earnedPoints * progress));
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      }
    };

    const id = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(id);
  }, [earnedPoints]);

  const sparkles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => ({
        id: index,
        style: {
          left: `${12 + index * 10}%`,
          top: `${10 + ((index * 7) % 40)}%`,
          animationDelay: `${index * 120}ms`,
        },
      })),
    []
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 px-4 py-8 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/30 bg-white shadow-[0_32px_90px_rgba(15,23,42,0.34)]">
        <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.38),_transparent_36%),linear-gradient(135deg,#0f172a,#1e293b)] px-6 py-7 text-white">
          {sparkles.map((sparkle) => (
            <Sparkles
              key={sparkle.id}
              className="absolute h-4 w-4 animate-pulse text-amber-300/80"
              style={sparkle.style}
            />
          ))}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-300/16">
              <Coins className="h-7 w-7 text-amber-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-white/60">
                LawBridge Earnings
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                {locale === "zh-TW" ? "本次收益已入帳" : "Payout queued"}
              </h3>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="rounded-[1.6rem] bg-amber-50 px-5 py-6 text-center">
            <p className="text-sm text-amber-800">
              {locale === "zh-TW"
                ? "恭喜完成一筆可追蹤收益"
                : "A completed call has been added to your tracked earnings."}
            </p>
            <p className="mt-3 text-5xl font-bold tracking-tight text-slate-900">
              +{displayValue}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {locale === "zh-TW" ? "點數" : "points"}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                {locale === "zh-TW" ? "通話時長" : "Call duration"}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {formatDuration(durationSec, locale)}
              </p>
            </div>
            <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                {locale === "zh-TW" ? "撥款節奏" : "Payout schedule"}
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-900">
                {locale === "zh-TW" ? "每週二 / 週五 14:00" : "Tue / Fri 14:00"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onViewWallet}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-[1.1rem] bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <Wallet className="h-4 w-4" />
              {locale === "zh-TW" ? "查看收益錢包" : "View earnings wallet"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-[1.1rem] bg-slate-100 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              {locale === "zh-TW" ? "繼續" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
