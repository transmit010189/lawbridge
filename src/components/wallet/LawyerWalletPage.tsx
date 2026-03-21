"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpCircle,
  Coins,
  Landmark,
  Loader2,
  TrendingUp,
  Wallet as WalletIcon,
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
import { db } from "@/lib/firebase/client";
import type { LawyerProfile, SupportedLocale, Wallet, WalletTransaction } from "@/types";

interface Props {
  locale: SupportedLocale;
}

function copy(locale: SupportedLocale) {
  const zh = locale === "zh-TW";
  return {
    title: zh ? "律師收益錢包" : "Lawyer earnings wallet",
    subtitle: zh
      ? "清楚看到收益點數、待撥款、入帳節奏與最近分潤紀錄。"
      : "Track wallet balance, pending payout, payout timing, and recent settlement history.",
    balance: zh ? "收益錢包餘額" : "Earnings balance",
    available: zh ? "可追蹤收益" : "Tracked earnings",
    pending: zh ? "待撥款" : "Pending payout",
    payoutSchedule: zh ? "撥款節奏" : "Payout schedule",
    payoutEta: zh ? "預估入帳" : "ETA",
    history: zh ? "收益明細" : "Payout history",
    noHistory: zh ? "目前尚無收益紀錄。完成第一通後，這裡會顯示每一筆分潤與待撥款。" : "No payout history yet.",
    thisMonth: zh ? "本月" : "This month",
    lastMonth: zh ? "上月" : "Last month",
    allTime: zh ? "累計" : "All time",
    accountVerified: zh ? "收款帳戶已驗證" : "Payout account verified",
    accountPending: zh ? "收款帳戶待驗證" : "Payout account pending",
    bankLast4: zh ? "銀行尾碼" : "Bank last 4",
    defaultSchedule: zh ? "每週二 / 週五 14:00 對帳" : "Tue / Fri 14:00 payout batch",
    defaultEta: zh ? "一般預估 T+2 個工作日入帳" : "Usually arrives in T+2 business days",
    withdrawHint: zh ? "目前先提供收益追蹤與撥款節奏。正式銀行出金會在藍新與後台對帳完成後開啟。" : "Bank withdrawals remain disabled until the settlement backend is switched on.",
  };
}

export function LawyerWalletPage({ locale }: Props) {
  const { user } = useAuthContext();
  const c = useMemo(() => copy(locale), [locale]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const uid = user?.uid;
      if (!uid) {
        setWallet(null);
        setProfile(null);
        setTransactions([]);
        setLoading(false);
        return;
      }
      const currentUid: string = uid;

      setLoading(true);
      try {
        const [walletSnap, profileSnap, txnSnap] = await Promise.all([
          getDoc(doc(db, "wallets", currentUid)),
          getDoc(doc(db, "lawyer_profiles", currentUid)),
          getDocs(query(collection(db, "wallet_transactions"), where("uid", "==", currentUid))),
        ]);

        setWallet(walletSnap.exists() ? (walletSnap.data() as Wallet) : null);
        setProfile(profileSnap.exists() ? (profileSnap.data() as LawyerProfile) : null);
        setTransactions(
          txnSnap.docs
            .map((snapshot) => snapshot.data() as WalletTransaction)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        );
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [user?.uid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" />
      </div>
    );
  }

  const payoutTransactions = transactions.filter((txn) => txn.type === "lawyer_payout");
  const totalEarned = payoutTransactions.reduce((sum, txn) => sum + txn.points, 0);
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 7);
  const thisMonthEarned = payoutTransactions
    .filter((txn) => txn.createdAt.startsWith(thisMonth))
    .reduce((sum, txn) => sum + txn.points, 0);
  const lastMonthEarned = payoutTransactions
    .filter((txn) => txn.createdAt.startsWith(previousMonth))
    .reduce((sum, txn) => sum + txn.points, 0);

  const availablePayout = wallet?.availablePayoutPoints ?? wallet?.pointsBalance ?? 0;
  const pendingPayout = wallet?.pendingPayoutPoints ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_38%),linear-gradient(135deg,#0f172a,#1e293b)] px-6 py-7 text-white">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.32em] text-white/60">LawBridge Wallet</p>
            <h2 className="mt-4 text-3xl font-semibold">{c.title}</h2>
            <p className="mt-3 text-sm leading-7 text-white/80">{c.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<WalletIcon className="h-5 w-5 text-emerald-600" />} label={c.balance} value={wallet?.pointsBalance ?? 0} />
        <SummaryCard icon={<Coins className="h-5 w-5 text-amber-600" />} label={c.pending} value={pendingPayout} />
        <SummaryCard icon={<TrendingUp className="h-5 w-5 text-sky-600" />} label={c.thisMonth} value={thisMonthEarned} />
        <SummaryCard icon={<ArrowUpCircle className="h-5 w-5 text-violet-600" />} label={c.allTime} value={totalEarned} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-semibold text-slate-900">{c.history}</h3>
          </div>

          {transactions.length === 0 ? (
            <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              {c.noHistory}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {transactions.map((txn) => (
                <div key={txn.id} className="rounded-[1.2rem] bg-slate-50 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {txn.type === "lawyer_payout"
                          ? locale === "zh-TW"
                            ? "案件分潤入帳"
                            : "Consultation payout"
                          : txn.type}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(txn.createdAt).toLocaleString(locale === "zh-TW" ? "zh-TW" : "en")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${txn.points >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {txn.points >= 0 ? "+" : ""}
                        {txn.points}
                        {" "}
                        {locale === "zh-TW" ? "點" : "pts"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {txn.status}
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
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
                <Landmark className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-slate-400">{c.available}</p>
                <p className="text-2xl font-semibold text-slate-900">
                  {availablePayout}
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {locale === "zh-TW" ? "點" : "pts"}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-[1.3rem] bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <DetailRow label={c.payoutSchedule} value={profile?.payoutScheduleNote || c.defaultSchedule} />
              <DetailRow label={c.payoutEta} value={profile?.payoutEtaNote || c.defaultEta} />
              <DetailRow label={c.bankLast4} value={profile?.payoutBankLast4 || "----"} />
              <DetailRow
                label={locale === "zh-TW" ? "收款狀態" : "Account status"}
                value={profile?.payoutAccountVerified ? c.accountVerified : c.accountPending}
              />
              <DetailRow label={c.lastMonth} value={`${lastMonthEarned} ${locale === "zh-TW" ? "點" : "pts"}`} />
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm leading-7 text-slate-600">{c.withdrawHint}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
          {icon}
        </div>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
