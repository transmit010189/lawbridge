"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import {
  BarChart3,
  Clock,
  DollarSign,
  Phone,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { SkeletonStatCards, SkeletonRows } from "@/components/Skeleton";
import { db } from "@/lib/firebase/client";
import { useTranslation } from "@/hooks/useTranslation";
import type { Consultation, SupportedLocale, WalletTransaction } from "@/types";

interface Props {
  locale: SupportedLocale;
  onNavigate: (tab: string) => void;
}

export function LawyerDashboard({ locale, onNavigate }: Props) {
  const { user } = useAuthContext();
  const t = useTranslation(locale);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      try {
        const consultQ = query(
          collection(db, "consultations"),
          where("lawyerUid", "==", user!.uid),
          where("status", "==", "completed"),
          orderBy("createdAt", "desc"),
          limit(50)
        );
        const consultSnap = await getDocs(consultQ);
        setConsultations(consultSnap.docs.map((d) => d.data() as Consultation));

        const txnQ = query(
          collection(db, "wallet_transactions"),
          where("uid", "==", user!.uid),
          where("type", "==", "lawyer_payout"),
          orderBy("createdAt", "desc"),
          limit(50)
        );
        const txnSnap = await getDocs(txnQ);
        setTransactions(txnSnap.docs.map((d) => d.data() as WalletTransaction));
      } catch {
        // Index may not exist — silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="animate-pulse brand-hero rounded-[1.8rem] px-6 py-7">
          <div className="h-5 w-24 rounded-lg bg-white/20" />
          <div className="mt-4 h-8 w-48 rounded-lg bg-white/20" />
          <div className="mt-3 h-4 w-72 rounded-lg bg-white/20" />
        </div>
        <SkeletonStatCards />
        <SkeletonRows count={3} />
      </div>
    );
  }

  const totalEarnings = transactions.reduce((sum, txn) => sum + txn.points, 0);
  const totalCalls = consultations.length;
  const totalMinutes = Math.ceil(consultations.reduce((sum, c) => sum + c.durationSec, 0) / 60);
  const totalPlatformFees = consultations.reduce((sum, c) => sum + c.platformFeePoints, 0);

  const today = new Date().toISOString().slice(0, 10);
  const todayConsults = consultations.filter((c) => c.createdAt?.startsWith(today));
  const todayEarnings = todayConsults.reduce((sum, c) => sum + c.lawyerPayoutPoints, 0);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthConsults = consultations.filter((c) => c.createdAt?.startsWith(thisMonth));
  const monthEarnings = monthConsults.reduce((sum, c) => sum + c.lawyerPayoutPoints, 0);

  const recentCalls = consultations.slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div className="brand-hero overflow-hidden rounded-[1.8rem] px-6 py-7 text-white">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/78">
            LawBridge
          </span>
          <h2 className="brand-title mt-4 text-3xl font-semibold">{t.dashboard.title}</h2>
          <p className="mt-3 text-sm leading-7 text-white/84">{t.dashboard.subtitle}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
          label={t.dashboard.netIncome}
          value={`${totalEarnings}`}
          suffix={t.common.pts}
          subtext={`${t.dashboard.todayStats}: +${todayEarnings} | ${t.dashboard.monthStats}: +${monthEarnings}`}
          accent="emerald"
        />
        <StatCard
          icon={<Phone className="h-5 w-5 text-sky-600" />}
          label={t.dashboard.totalCalls}
          value={`${totalCalls}`}
          suffix={t.dashboard.calls}
          subtext={`${t.dashboard.todayStats}: ${todayConsults.length} | ${t.dashboard.monthStats}: ${monthConsults.length}`}
          accent="sky"
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-amber-600" />}
          label={t.dashboard.totalMinutes}
          value={`${totalMinutes}`}
          suffix={t.common.min}
          subtext={`${t.dashboard.platformFees}: ${totalPlatformFees} ${t.common.pts}`}
          accent="amber"
        />
        <StatCard
          icon={<Star className="h-5 w-5 text-purple-600" />}
          label={t.dashboard.avgRating}
          value={totalCalls > 0 ? "—" : t.dashboard.noRating}
          suffix=""
          subtext={`${totalCalls} ${t.dashboard.calls}`}
          accent="purple"
        />
      </div>

      {/* Quick Actions + Recent Calls */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Recent Calls */}
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-sky-600" />
              <h3 className="text-lg font-semibold text-slate-900">{t.dashboard.recentCalls}</h3>
            </div>
          </div>

          {recentCalls.length === 0 ? (
            <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3">{t.dashboard.noCalls}</p>
              <button
                type="button"
                onClick={() => onNavigate("lawyers")}
                className="mt-4 rounded-[1.2rem] bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                {t.dashboard.goOnline}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {recentCalls.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-[1.2rem] bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t.common.voiceConsultation}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(c.createdAt).toLocaleString(locale === "zh-TW" ? "zh-TW" : "en")}
                      {" · "}
                      {Math.ceil(c.durationSec / 60)} {t.common.min}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-emerald-600">
                      +{c.lawyerPayoutPoints} {t.common.pts}
                    </span>
                    <p className="text-xs text-slate-400">
                      {t.common.platformFee}: {c.platformFeePoints}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{t.dashboard.quickActions}</p>
            <div className="mt-4 space-y-2">
              <QuickAction icon={<TrendingUp className="h-4 w-4" />} label={t.dashboard.goOnline} onClick={() => onNavigate("lawyers")} accent="emerald" />
              <QuickAction icon={<Users className="h-4 w-4" />} label={t.dashboard.editProfile} onClick={() => onNavigate("lawyers")} accent="sky" />
              <QuickAction icon={<DollarSign className="h-4 w-4" />} label={t.dashboard.viewWallet} onClick={() => onNavigate("wallet")} accent="amber" />
            </div>
          </div>

          {/* Earnings Breakdown */}
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm uppercase tracking-[0.28em] text-slate-400">
              {t.dashboard.earningsBreakdown}
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{t.dashboard.totalEarnings}</span>
                <span className="font-semibold text-slate-900">{totalEarnings + totalPlatformFees} {t.common.pts}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{t.dashboard.platformFees}</span>
                <span className="font-semibold text-red-500">-{totalPlatformFees} {t.common.pts}</span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">{t.dashboard.netIncome}</span>
                  <span className="text-lg font-bold text-emerald-600">{totalEarnings} {t.common.pts}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  suffix,
  subtext,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  subtext: string;
  accent: "emerald" | "sky" | "amber" | "purple";
}) {
  const bgMap = { emerald: "bg-emerald-50", sky: "bg-sky-50", amber: "bg-amber-50", purple: "bg-purple-50" };
  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${bgMap[accent]}`}>
          {icon}
        </div>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900">
        {value} <span className="text-sm font-normal text-slate-400">{suffix}</span>
      </p>
      <p className="mt-1 text-xs text-slate-400">{subtext}</p>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent: "emerald" | "sky" | "amber";
}) {
  const colorMap = { emerald: "text-emerald-600", sky: "text-sky-600", amber: "text-amber-600" };
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[1.2rem] bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100"
    >
      <span className={colorMap[accent]}>{icon}</span>
      {label}
    </button>
  );
}
