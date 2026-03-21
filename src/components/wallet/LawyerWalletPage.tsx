"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import {
  ArrowUpCircle,
  Loader2,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import { useTranslation } from "@/hooks/useTranslation";
import type { SupportedLocale, Wallet, WalletTransaction } from "@/types";

interface Props {
  locale: SupportedLocale;
}

export function LawyerWalletPage({ locale }: Props) {
  const { user } = useAuthContext();
  const t = useTranslation(locale);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  useEffect(() => {
    async function fetchData() {
      const uid = user?.uid;
      if (!uid) {
        setWallet(null);
        setTransactions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const walletDoc = await getDoc(doc(db, "wallets", uid));
        if (walletDoc.exists()) {
          setWallet(walletDoc.data() as Wallet);
        }

        const txnQuery = query(
          collection(db, "wallet_transactions"),
          where("uid", "==", uid),
          orderBy("createdAt", "desc"),
          limit(30)
        );
        const txnSnap = await getDocs(txnQuery);
        setTransactions(txnSnap.docs.map((d) => d.data() as WalletTransaction));
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [user?.uid]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" /></div>;
  }

  const payoutTxns = transactions.filter((txn) => txn.type === "lawyer_payout");
  const totalEarned = payoutTxns.reduce((sum, txn) => sum + txn.points, 0);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);

  const thisMonthEarned = payoutTxns.filter((txn) => txn.createdAt.startsWith(thisMonth)).reduce((sum, txn) => sum + txn.points, 0);
  const lastMonthEarned = payoutTxns.filter((txn) => txn.createdAt.startsWith(lastMonth)).reduce((sum, txn) => sum + txn.points, 0);

  const txnTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      topup: t.lawyerWallet.txnTopup,
      consult_charge: t.lawyerWallet.txnConsultCharge,
      lawyer_payout: t.lawyerWallet.txnLawyerPayout,
      platform_fee: t.lawyerWallet.txnPlatformFee,
      refund: t.lawyerWallet.txnRefund,
      subscription_charge: t.lawyerWallet.txnSubscription,
    };
    return map[type] || type;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="brand-hero overflow-hidden rounded-[1.8rem] px-6 py-7 text-white">
        <div className="max-w-xl">
          <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/80">{t.lawyerWallet.title}</span>
          <h2 className="brand-title mt-4 text-3xl font-semibold">{wallet?.pointsBalance ?? 0} {t.common.pts}</h2>
          <p className="mt-3 text-sm leading-7 text-white/84">{t.lawyerWallet.subtitle}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-semibold text-slate-900">{t.lawyerWallet.history}</h3>
          </div>

          {transactions.length === 0 ? (
            <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{t.lawyerWallet.noHistory}</div>
          ) : (
            <div className="mt-4 space-y-2">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between rounded-[1.2rem] bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{txnTypeLabel(txn.type)}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(txn.createdAt).toLocaleString(locale === "zh-TW" ? "zh-TW" : "en")}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${txn.points > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {txn.points > 0 ? "+" : ""}{txn.points} {t.common.pts}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><WalletIcon className="h-5 w-5" /></div>
              <div>
                <p className="text-sm text-slate-400">{t.lawyerWallet.balance}</p>
                <p className="text-2xl font-semibold text-slate-900">{wallet?.pointsBalance ?? 0} <span className="text-sm font-normal text-slate-500">{t.common.pts}</span></p>
              </div>
            </div>
            <button
              type="button"
              disabled
              className="mt-4 w-full rounded-[1.3rem] bg-slate-100 px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
            >
              {t.lawyerWallet.withdraw}
            </button>
            <p className="mt-2 text-center text-xs text-slate-400">{t.lawyerWallet.withdrawHint}</p>
          </div>

          <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{t.lawyerWallet.earningsBreakdown}</p>
            </div>
            <div className="mt-4 space-y-3">
              <EarningsRow label={t.lawyerWallet.thisMonth} value={thisMonthEarned} suffix={t.common.pts} />
              <EarningsRow label={t.lawyerWallet.lastMonth} value={lastMonthEarned} suffix={t.common.pts} />
              <div className="border-t border-slate-100 pt-3">
                <EarningsRow label={t.lawyerWallet.allTime} value={totalEarned} suffix={t.common.pts} bold />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EarningsRow({ label, value, suffix, bold }: { label: string; value: number; suffix: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? "font-medium text-slate-900" : "text-slate-600"}>{label}</span>
      <span className={`${bold ? "text-lg font-bold text-emerald-600" : "font-semibold text-slate-800"}`}>
        {value > 0 ? "+" : ""}{value} {suffix}
      </span>
    </div>
  );
}
