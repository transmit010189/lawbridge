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
  AlertCircle,
  Link2,
} from "lucide-react";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { authenticatedFetch } from "@/lib/api/authenticatedFetch";
import { db } from "@/lib/firebase/client";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  SupportedLocale,
  Wallet,
  WalletTransaction,
  PaymentMethod,
  TransactionStatus,
} from "@/types";

interface Props {
  locale: SupportedLocale;
}

interface GatewayStatus {
  provider: "newebpay";
  configured: boolean;
  mode: "production" | "test";
  supportedMethods: PaymentMethod[];
}

const TOPUP_OPTIONS = [100, 300, 500, 1000];

function submitNewebPayForm(input: {
  gatewayUrl: string;
  merchantId: string;
  tradeInfo: string;
  tradeSha: string;
  version: string;
}) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = input.gatewayUrl;

  const fields: Record<string, string> = {
    MerchantID_: input.merchantId,
    TradeInfo: input.tradeInfo,
    TradeSha: input.tradeSha,
    Version: input.version,
  };

  Object.entries(fields).forEach(([name, value]) => {
    const element = document.createElement("input");
    element.type = "hidden";
    element.name = name;
    element.value = value;
    form.appendChild(element);
  });

  document.body.appendChild(form);
  form.submit();
  form.remove();
}

export function WalletPage({ locale }: Props) {
  const { user } = useAuthContext();
  const t = useTranslation(locale);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cvs");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [banner, setBanner] = useState<{
    tone: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const selectedWalletTxnId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("walletTxnId")
      : "";

  useEffect(() => {
    let cancelled = false;

    async function fetchGatewayStatus() {
      try {
        const res = await fetch("/api/wallet/newebpay");
        if (!res.ok) return;
        const data = (await res.json()) as GatewayStatus;
        if (!cancelled) {
          setGatewayStatus(data);
        }
      } catch (err) {
        console.error("Gateway status error:", err);
      }
    }

    void fetchGatewayStatus();

    return () => {
      cancelled = true;
    };
  }, []);

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
        setTransactions(txnSnap.docs.map((snapshot) => snapshot.data() as WalletTransaction));
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [user?.uid, refreshKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const paymentStatus = url.searchParams.get("payment");
    if (!paymentStatus) {
      return;
    }

    const messageMap = {
      settled: { tone: "success" as const, message: t.wallet.paymentSettled },
      pending: { tone: "warning" as const, message: t.wallet.paymentPending },
      failed: { tone: "error" as const, message: t.wallet.paymentFailed },
      processing: { tone: "warning" as const, message: t.wallet.paymentProcessing },
    };

    setBanner(messageMap[paymentStatus as keyof typeof messageMap] || null);
    setRefreshKey((value) => value + 1);
    url.searchParams.delete("payment");
    url.searchParams.delete("tab");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }, [t.wallet.paymentFailed, t.wallet.paymentPending, t.wallet.paymentProcessing, t.wallet.paymentSettled]);

  const txnTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      topup: t.wallet.txnTopup,
      consult_charge: t.wallet.txnConsultCharge,
      lawyer_payout: t.wallet.txnLawyerPayout,
      platform_fee: t.wallet.txnPlatformFee,
      refund: t.wallet.txnRefund,
      subscription_charge: t.wallet.txnSubscription,
    };
    return map[type] || type;
  };

  const txnStatusLabel = (status: TransactionStatus) => {
    const map: Record<TransactionStatus, string> = {
      pending: t.wallet.statusPending,
      settled: t.wallet.statusSettled,
      failed: t.wallet.statusFailed,
    };
    return map[status];
  };

  const txnStatusClass = (status: TransactionStatus) => {
    const map: Record<TransactionStatus, string> = {
      pending: "bg-amber-100 text-amber-700",
      settled: "bg-emerald-100 text-emerald-700",
      failed: "bg-rose-100 text-rose-700",
    };
    return map[status];
  };

  const handleTopUp = async () => {
    if (!selectedAmount || !user) return;

    setTopUpLoading(true);
    setBanner(null);

    try {
      const res = await authenticatedFetch("/api/wallet/newebpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          amount: selectedAmount,
          paymentMethod,
        }),
      });

      const data = (await res.json()) as
        | {
            gatewayUrl: string;
            merchantId: string;
            tradeInfo: string;
            tradeSha: string;
            version: string;
          }
        | { error?: string; message?: string };

      if (!res.ok) {
        const errorMap: Record<string, string> = {
          NEWEBPAY_NOT_CONFIGURED: t.wallet.gatewayPendingHint,
          AUTH_REQUIRED: t.wallet.authRequired,
          INVALID_AMOUNT: t.wallet.invalidAmount,
          INVALID_PAYMENT_METHOD: t.wallet.invalidPaymentMethod,
        };

        const errorKey = "error" in data && data.error ? data.error : "";
        setBanner({
          tone: "error",
          message: errorMap[errorKey] || ("message" in data && data.message ? data.message : t.wallet.paymentCreateFailed),
        });
        return;
      }

      submitNewebPayForm(data as {
        gatewayUrl: string;
        merchantId: string;
        tradeInfo: string;
        tradeSha: string;
        version: string;
      });
    } catch (err) {
      console.error("Create payment error:", err);
      setBanner({
        tone: "error",
        message:
          err instanceof Error && err.message === "AUTH_REQUIRED"
            ? t.wallet.authRequired
            : t.wallet.paymentCreateFailed,
      });
    } finally {
      setTopUpLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" /></div>;
  }

  const gatewayReady = Boolean(gatewayStatus?.configured);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="brand-hero overflow-hidden rounded-[1.8rem] px-6 py-7 text-white">
          <div className="max-w-xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/80">{t.wallet.title}</span>
            <h2 className="brand-title mt-4 text-3xl font-semibold">{wallet?.pointsBalance ?? 0} {t.wallet.points}</h2>
            <p className="mt-3 text-sm leading-7 text-white/84">{t.wallet.subtitle}</p>
          </div>
        </div>

        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600"><WalletIcon className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-slate-400">{t.wallet.balance}</p>
              <p className="text-2xl font-semibold text-slate-900">{wallet?.pointsBalance ?? 0} <span className="text-sm font-normal text-slate-500">{t.wallet.points}</span></p>
            </div>
          </div>
          <div className={`mt-5 rounded-[1.4rem] px-4 py-4 text-sm ${gatewayReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{gatewayReady ? t.wallet.gatewayReady : t.wallet.gatewayPending}</p>
                <p className="mt-1 leading-6 opacity-90">
                  {gatewayReady ? t.wallet.gatewayReadyHint : t.wallet.gatewayPendingHint}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {banner ? (
        <div className={`flex items-start gap-3 rounded-[1.5rem] px-4 py-4 text-sm shadow-sm ${
          banner.tone === "success"
            ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
            : banner.tone === "warning"
              ? "border border-amber-200 bg-amber-50 text-amber-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
        }`}>
          {banner.tone === "success" ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p>{banner.message}</p>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ArrowDownCircle className="h-5 w-5 text-emerald-600" /><h3 className="text-lg font-semibold text-slate-900">{t.wallet.topUp}</h3></div>
          <div className="mt-5">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{t.wallet.selectAmount}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {TOPUP_OPTIONS.map((amount) => (
                <button key={amount} type="button" onClick={() => setSelectedAmount(amount)} className={`rounded-[1.3rem] border px-4 py-4 text-center transition ${selectedAmount === amount ? "border-[rgba(184,100,67,0.45)] bg-[rgba(184,100,67,0.08)] text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <div className="text-lg font-semibold">{amount}</div>
                  <div className="mt-1 text-xs text-slate-400">{t.wallet.twd}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="mt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{t.wallet.paymentMethod}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <PaymentMethodCard active={paymentMethod === "cvs"} icon={<Store className="h-5 w-5 text-amber-600" />} title={t.wallet.convenienceStore} description={t.wallet.convenienceHint} onClick={() => setPaymentMethod("cvs")} />
              <PaymentMethodCard active={paymentMethod === "card"} icon={<CreditCard className="h-5 w-5 text-sky-600" />} title={t.wallet.card} description={t.wallet.cardHint} onClick={() => setPaymentMethod("card")} />
            </div>
          </div>
          <button
            type="button"
            onClick={handleTopUp}
            disabled={!selectedAmount || topUpLoading || !gatewayReady}
            className={`mt-6 inline-flex items-center justify-center gap-2 rounded-[1.3rem] px-5 py-3 text-sm font-medium transition ${selectedAmount && !topUpLoading && gatewayReady ? "bg-[var(--brand-ink)] text-white hover:bg-slate-800" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}
          >
            {topUpLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t.wallet.confirm}{selectedAmount ? ` · ${selectedAmount} ${t.wallet.twd}` : ""}
          </button>
        </div>

        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><ArrowUpCircle className="h-5 w-5 text-sky-600" /><h3 className="text-lg font-semibold text-slate-900">{t.wallet.history}</h3></div>
          {transactions.length === 0 ? (
            <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">{t.wallet.noHistory}</div>
          ) : (
            <div className="mt-4 space-y-2">
              {transactions.map((txn) => (
                <div
                  key={txn.id}
                  className={`rounded-[1.2rem] px-4 py-3 ${
                    txn.id === selectedWalletTxnId
                      ? "border border-sky-200 bg-sky-50"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-800">{txnTypeLabel(txn.type)}</p>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${txnStatusClass(txn.status)}`}>
                          {txnStatusLabel(txn.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(txn.createdAt).toLocaleString(locale === "zh-TW" ? "zh-TW" : "en")}
                        {txn.gateway ? ` · ${txn.gateway.toUpperCase()}` : ""}
                      </p>
                      {txn.paymentInstructions ? (
                        <p className="mt-2 text-xs text-slate-500">{txn.paymentInstructions}</p>
                      ) : null}
                      {txn.paymentExpiresAt ? (
                        <p className="mt-1 text-xs text-slate-400">{t.wallet.expiresAt}: {txn.paymentExpiresAt}</p>
                      ) : null}
                    </div>
                    <span className={`text-sm font-semibold ${txn.points > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {txn.points > 0 ? "+" : ""}{txn.points} {t.wallet.points}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentMethodCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`rounded-[1.4rem] border px-4 py-4 text-left transition ${active ? "border-[rgba(184,100,67,0.45)] bg-[rgba(184,100,67,0.08)]" : "border-slate-200 hover:bg-slate-50"}`}>
      <div className="flex items-center gap-3">{icon}</div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
    </button>
  );
}
