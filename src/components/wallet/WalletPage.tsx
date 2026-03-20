"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  Loader2,
  Store,
  Wallet as WalletIcon,
  CheckCircle,
} from "lucide-react";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import type { SupportedLocale, Wallet, WalletTransaction } from "@/types";

interface Props {
  locale: SupportedLocale;
}

const TOPUP_OPTIONS = [100, 300, 500, 1000];

const en = {
  title: "Wallet",
  subtitle: "You can review the current points balance here. Payment and transaction integrations are still in progress.",
  balance: "Points balance",
  points: "pts",
  topUp: "Top up",
  selectAmount: "Select amount",
  twd: "TWD",
  paymentMethod: "Payment method",
  convenienceStore: "Convenience store code",
  convenienceHint: "Future flow: generate a payment code for 7-11, FamilyMart, or Hi-Life.",
  card: "Credit card",
  confirm: "Confirm top up",
  history: "Transaction history",
  noHistory: "No transaction history yet.",
  comingSoon: "Payment integration is not finished yet. This page currently shows the planned structure only.",
};

const zh = {
  title: "錢包",
  subtitle: "目前可查看點數餘額。付款與交易串接仍在開發中。",
  balance: "點數餘額",
  points: "點",
  topUp: "儲值",
  selectAmount: "選擇金額",
  twd: "TWD",
  paymentMethod: "付款方式",
  convenienceStore: "超商代碼",
  convenienceHint: "未來可產生 7-11、全家或萊爾富的繳費代碼。",
  card: "信用卡",
  confirm: "確認儲值",
  history: "交易紀錄",
  noHistory: "目前沒有交易紀錄。",
  comingSoon: "付款串接尚未完成，目前僅提供版面與資料結構。",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

export function WalletPage({ locale }: Props) {
  const { user } = useAuthContext();
  const copy = getCopy(locale);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cvs">("cvs");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpSuccess, setTopUpSuccess] = useState(false);
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
        } else {
          setWallet(null);
        }

        const txnQuery = query(
          collection(db, "wallet_transactions"),
          where("uid", "==", uid),
          orderBy("createdAt", "desc"),
          limit(20)
        );
        const txnSnap = await getDocs(txnQuery);
        setTransactions(txnSnap.docs.map((d) => d.data() as WalletTransaction));
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [user?.uid, refreshKey]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="brand-hero overflow-hidden rounded-[1.8rem] px-6 py-7 text-white">
          <div className="max-w-xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/80">{copy.title}</span>
            <h2 className="brand-title mt-4 text-3xl font-semibold">{wallet?.pointsBalance ?? 0} {copy.points}</h2>
            <p className="mt-3 text-sm leading-7 text-white/84">{copy.subtitle}</p>
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600"><WalletIcon className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-slate-400">{copy.balance}</p>
              <p className="text-2xl font-semibold text-slate-900">{wallet?.pointsBalance ?? 0} <span className="text-sm font-normal text-slate-500">{copy.points}</span></p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-semibold text-slate-900">{copy.topUp}</h3></div>
          <div className="mt-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{copy.selectAmount}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {TOPUP_OPTIONS.map((amount) => (
                <button key={amount} type="button" onClick={() => setSelectedAmount(amount)} className={`rounded-[1.3rem] border px-4 py-4 text-center transition ${selectedAmount === amount ? "border-[rgba(184,100,67,0.45)] bg-[rgba(184,100,67,0.08)] text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <div className="text-lg font-semibold">{amount}</div>
                  <div className="mt-1 text-xs text-slate-400">{copy.twd}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{copy.paymentMethod}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <PaymentMethodCard active={paymentMethod === "cvs"} icon={<Store className="h-5 w-5 text-amber-600" />} title={copy.convenienceStore} description={copy.convenienceHint} onClick={() => setPaymentMethod("cvs")} />
              <PaymentMethodCard active={paymentMethod === "card"} icon={<CreditCard className="h-5 w-5 text-sky-600" />} title={copy.card} description="" onClick={() => setPaymentMethod("card")} />
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!selectedAmount || !user) return;
              setTopUpLoading(true);
              setTopUpSuccess(false);
              try {
                const res = await fetch("/api/wallet/topup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ uid: user.uid, amount: selectedAmount }),
                });
                const data = await res.json();
                if (data.success) {
                  setWallet((w) => w ? { ...w, pointsBalance: data.newBalance } : w);
                  setTopUpSuccess(true);
                  setSelectedAmount(null);
                  setRefreshKey((value) => value + 1);
                  setTimeout(() => setTopUpSuccess(false), 3000);
                }
              } catch (err) {
                console.error("Top-up error:", err);
              } finally {
                setTopUpLoading(false);
              }
            }}
            disabled={!selectedAmount || topUpLoading}
            className={`mt-6 inline-flex items-center justify-center gap-2 rounded-[1.3rem] px-5 py-3 text-sm font-medium transition ${selectedAmount && !topUpLoading ? "bg-[var(--brand-ink)] text-white hover:bg-slate-800" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}
          >
            {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {copy.confirm}{selectedAmount ? ` · ${selectedAmount} ${copy.twd}` : ""}
          </button>
          {topUpSuccess ? (
            <div className="mt-4 flex items-center gap-2 rounded-[1.3rem] bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              {locale === "zh-TW" ? "儲值成功！" : "Top-up successful!"}
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ArrowUpCircle className="h-5 w-5 text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">{copy.history}</h3></div>
          {transactions.length === 0 ? (
            <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{copy.noHistory}</div>
          ) : (
            <div className="mt-4 space-y-2">
              {transactions.map((txn) => (
                <div key={txn.id} className="flex items-center justify-between rounded-[1.2rem] bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {txn.type === "topup" ? (locale === "zh-TW" ? "儲值" : "Top up") :
                       txn.type === "consult_charge" ? (locale === "zh-TW" ? "諮詢扣款" : "Consultation") :
                       txn.type === "lawyer_payout" ? (locale === "zh-TW" ? "律師入帳" : "Payout") :
                       txn.type === "platform_fee" ? (locale === "zh-TW" ? "平台費" : "Platform fee") :
                       txn.type}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(txn.createdAt).toLocaleString(locale === "zh-TW" ? "zh-TW" : "en")}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${txn.points > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {txn.points > 0 ? "+" : ""}{txn.points} {copy.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentMethodCard({ active, icon, title, description, onClick }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void; }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-[1.4rem] border px-4 py-4 text-left transition ${active ? "border-[rgba(184,100,67,0.45)] bg-[rgba(184,100,67,0.08)]" : "border-slate-200 hover:bg-slate-50"}`}>
      <div className="flex items-center gap-3">{icon}</div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
    </button>
  );
}
