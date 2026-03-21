"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock3,
  Coins,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { SkeletonRows, SkeletonStatCards } from "@/components/Skeleton";
import { db } from "@/lib/firebase/client";
import type { Consultation, LawyerProfile, SupportedLocale, Wallet as WalletType, WalletTransaction } from "@/types";

interface Props {
  locale: SupportedLocale;
  onNavigate: (tab: string) => void;
}

function copy(locale: SupportedLocale) {
  const zh = locale === "zh-TW";

  return {
    title: zh ? "律師收益工作台" : "Lawyer earnings desk",
    subtitle: zh
      ? "把 KYC、分潤、待撥款與近期通話集中在同一個畫面，讓你知道現在上線能賺多少。"
      : "Track KYC, pending payout, and recent calls in one place.",
    payoutWindow: zh ? "每週二 / 週五 14:00 對帳" : "Tue / Fri 14:00 payout batch",
    kycReady: zh ? "KYC 已完成" : "KYC complete",
    kycPending: zh ? "KYC 待完成" : "KYC pending",
    totalEarned: zh ? "累計收入" : "Lifetime earned",
    todayEarned: zh ? "今日收益" : "Today earned",
    monthlyEarned: zh ? "本月收益" : "This month",
    totalCalls: zh ? "完成通話" : "Completed calls",
    totalMinutes: zh ? "通話分鐘" : "Minutes",
    pendingPayout: zh ? "待撥款" : "Pending payout",
    availableWallet: zh ? "收益錢包" : "Earnings wallet",
    nextBatch: zh ? "下次撥款節奏" : "Next payout batch",
    goOnline: zh ? "前往律師工作台" : "Open lawyer desk",
    viewWallet: zh ? "查看收益錢包" : "View wallet",
    recentCalls: zh ? "近期完成案件" : "Recent completed calls",
    noCalls: zh ? "目前還沒有完成中的收益紀錄。完成第一通後，這裡會顯示入帳與分潤。" : "No completed calls yet.",
    eta: zh ? "一般預估 T+2 個工作日入銀行帳戶" : "Usually arrives in T+2 business days",
    payoutReady: zh ? "撥款追蹤已啟用" : "Payout tracking ready",
  };
}

export function LawyerDashboard({ locale, onNavigate }: Props) {
  const { user } = useAuthContext();
  const c = useMemo(() => copy(locale), [locale]);
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [wallet, setWallet] = useState<WalletType | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      return;
    }
    const currentUid: string = uid;

    async function fetchData() {
      setLoading(true);
      try {
        const [profileSnap, walletSnap, consultationSnap, txnSnap] = await Promise.all([
          getDoc(doc(db, "lawyer_profiles", currentUid)),
          getDoc(doc(db, "wallets", currentUid)),
          getDocs(query(collection(db, "consultations"), where("lawyerUid", "==", currentUid))),
          getDocs(query(collection(db, "wallet_transactions"), where("uid", "==", currentUid))),
        ]);

        setProfile(profileSnap.exists() ? (profileSnap.data() as LawyerProfile) : null);
        setWallet(walletSnap.exists() ? (walletSnap.data() as WalletType) : null);

        const consultationRows = consultationSnap.docs
          .map((snapshot) => snapshot.data() as Consultation)
          .filter((item) => item.status === "completed")
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        setConsultations(consultationRows);

        const transactionRows = txnSnap.docs
          .map((snapshot) => snapshot.data() as WalletTransaction)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        setTransactions(transactionRows);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="animate-pulse rounded-[1.8rem] bg-slate-900 px-6 py-8">
          <div className="h-5 w-28 rounded-lg bg-white/10" />
          <div className="mt-4 h-8 w-64 rounded-lg bg-white/10" />
          <div className="mt-3 h-4 w-96 rounded-lg bg-white/10" />
        </div>
        <SkeletonStatCards />
        <SkeletonRows count={3} />
      </div>
    );
  }

  const payoutTransactions = transactions.filter((item) => item.type === "lawyer_payout");
  const totalEarned = payoutTransactions.reduce((sum, item) => sum + item.points, 0);
  const totalMinutes = Math.ceil(
    consultations.reduce((sum, item) => sum + (item.durationSec || 0), 0) / 60
  );
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);
  const todayEarned = consultations
    .filter((item) => item.createdAt.startsWith(today))
    .reduce((sum, item) => sum + item.lawyerPayoutPoints, 0);
  const monthlyEarned = consultations
    .filter((item) => item.createdAt.startsWith(month))
    .reduce((sum, item) => sum + item.lawyerPayoutPoints, 0);
  const pendingPayout = wallet?.pendingPayoutPoints ?? 0;
  const availableWallet = wallet?.pointsBalance ?? 0;
  const averageRating =
    profile?.ratingCount && profile.ratingCount > 0
      ? profile.ratingAvg.toFixed(1)
      : locale === "zh-TW"
        ? "尚無"
        : "N/A";
  const recentCalls = consultations.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_36%),linear-gradient(135deg,#0f172a,#111827)] px-6 py-7 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.32em] text-white/60">LawBridge Counsel</p>
              <h2 className="mt-3 text-3xl font-semibold">{c.title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/80">{c.subtitle}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <HeroBadge
                icon={<ShieldCheck className="h-4 w-4" />}
                label={profile?.licenseStatus === "verified" ? c.kycReady : c.kycPending}
              />
              <HeroBadge
                icon={<Coins className="h-4 w-4" />}
                label={`${c.pendingPayout}: ${pendingPayout}`}
              />
              <HeroBadge icon={<Sparkles className="h-4 w-4" />} label={c.payoutReady} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Coins className="h-5 w-5 text-emerald-600" />} label={c.totalEarned} value={`${totalEarned}`} suffix={locale === "zh-TW" ? "點" : "pts"} subtext={`${c.todayEarned}: +${todayEarned}`} />
        <MetricCard icon={<TrendingUp className="h-5 w-5 text-amber-600" />} label={c.monthlyEarned} value={`${monthlyEarned}`} suffix={locale === "zh-TW" ? "點" : "pts"} subtext={`${c.pendingPayout}: ${pendingPayout}`} />
        <MetricCard icon={<Clock3 className="h-5 w-5 text-sky-600" />} label={c.totalMinutes} value={`${totalMinutes}`} suffix={locale === "zh-TW" ? "分" : "min"} subtext={`${c.totalCalls}: ${consultations.length}`} />
        <MetricCard icon={<BarChart3 className="h-5 w-5 text-violet-600" />} label={locale === "zh-TW" ? "平均評分" : "Average rating"} value={averageRating} suffix="" subtext={`${profile?.ratingCount ?? 0} reviews`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-semibold text-slate-900">{c.recentCalls}</h3>
          </div>

          {recentCalls.length === 0 ? (
            <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              {c.noCalls}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {recentCalls.map((consultation) => (
                <div key={consultation.id} className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {consultation.workerDisplayName || (locale === "zh-TW" ? "外勞諮詢" : "Worker consultation")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(consultation.createdAt).toLocaleString(locale === "zh-TW" ? "zh-TW" : "en")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-600">
                        +{consultation.lawyerPayoutPoints} {locale === "zh-TW" ? "點" : "pts"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {Math.max(1, Math.ceil(consultation.durationSec / 60))} {locale === "zh-TW" ? "分鐘" : "min"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{c.availableWallet}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">
              {availableWallet}
              <span className="ml-2 text-sm font-normal text-slate-500">
                {locale === "zh-TW" ? "點" : "pts"}
              </span>
            </p>
            <div className="mt-4 space-y-3 rounded-[1.3rem] bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <InfoRow label={c.pendingPayout} value={`${pendingPayout} ${locale === "zh-TW" ? "點" : "pts"}`} />
              <InfoRow label={c.nextBatch} value={profile?.payoutScheduleNote || c.payoutWindow} />
              <InfoRow label={locale === "zh-TW" ? "撥款備註" : "Payout note"} value={profile?.payoutEtaNote || c.eta} />
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              {locale === "zh-TW" ? "快速入口" : "Quick actions"}
            </p>
            <div className="mt-4 space-y-2">
              <ActionButton icon={<ShieldCheck className="h-4 w-4" />} label={c.goOnline} onClick={() => onNavigate("lawyers")} />
              <ActionButton icon={<Wallet className="h-4 w-4" />} label={c.viewWallet} onClick={() => onNavigate("wallet")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  suffix,
  subtext,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  subtext: string;
}) {
  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
          {icon}
        </div>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-bold text-slate-900">
        {value}
        {suffix ? <span className="ml-2 text-sm font-normal text-slate-500">{suffix}</span> : null}
      </p>
      <p className="mt-2 text-xs text-slate-400">{subtext}</p>
    </div>
  );
}

function HeroBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-3 py-2 text-xs text-white/82">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[1.2rem] bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100"
    >
      {icon}
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
