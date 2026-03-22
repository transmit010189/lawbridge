"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  History,
  Loader2,
  LogOut,
  MessageCircle,
  Phone,
  Scale,
  Shield,
  User,
  Wallet,
} from "lucide-react";
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { AuthProvider, useAuthContext } from "@/components/auth/AuthProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoginPage } from "@/components/auth/LoginPage";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { LocaleMenu } from "@/components/branding/LocaleMenu";
import { AiChatPage } from "@/components/consultation/AiChatPage";
import { CallWindow } from "@/components/consultation/CallWindow";
import { ConsultationRecordingPanel } from "@/components/consultation/ConsultationRecordingPanel";
import { IncomingCallBanner } from "@/components/consultation/IncomingCallBanner";
import { LawyerPayoutCelebration } from "@/components/consultation/LawyerPayoutCelebration";
import { PostCallRating } from "@/components/consultation/PostCallRating";
import { LawyerDashboard } from "@/components/lawyer/LawyerDashboard";
import { LawyerListPage } from "@/components/lawyer/LawyerListPage";
import { LawyerVerificationPage } from "@/components/lawyer/LawyerVerificationPage";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";
import { LawyerWalletPage } from "@/components/wallet/LawyerWalletPage";
import { WalletPage } from "@/components/wallet/WalletPage";
import { authenticatedFetch } from "@/lib/api/authenticatedFetch";
import { db } from "@/lib/firebase/client";
import { locales } from "@/lib/i18n";
import { useTranslation, interpolate } from "@/hooks/useTranslation";
import type { SupportedLocale, Consultation } from "@/types";

type Tab =
  | "home"
  | "ai"
  | "lawyers"
  | "wallet"
  | "profile"
  | "lawyer-verification";

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { user, loading } = useAuthContext();
  const [selectedLocale, setSelectedLocale] = useState<SupportedLocale>(() => {
    if (typeof window === "undefined") {
      return "zh-TW";
    }

    const storedLocale = window.localStorage.getItem("lawbridge-locale");
    return storedLocale && locales.includes(storedLocale as SupportedLocale)
      ? (storedLocale as SupportedLocale)
      : "zh-TW";
  });

  useEffect(() => {
    window.localStorage.setItem("lawbridge-locale", selectedLocale);
  }, [selectedLocale]);

  if (loading) {
    return <LoadingScreen locale={selectedLocale} />;
  }

  if (!user) {
    return <LoginPage locale={selectedLocale} onLocaleChange={setSelectedLocale} />;
  }

  return <HomePage locale={selectedLocale} onLocaleChange={setSelectedLocale} />;
}

function LoadingScreen({ locale }: { locale: SupportedLocale }) {
  const t = useTranslation(locale);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="brand-surface flex w-full max-w-md flex-col items-center rounded-[2rem] px-8 py-12 text-center">
        <BrandLogo />
        <Loader2 className="mt-8 h-10 w-10 animate-spin text-[var(--brand-accent)]" />
        <p className="mt-4 text-sm text-slate-500">{t.app.loading}</p>
      </div>
    </div>
  );
}

function HomePage({
  locale,
  onLocaleChange,
}: {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
}) {
  const { user, signOut } = useAuthContext();
  const t = useTranslation(locale);
  const [currentTab, setCurrentTab] = useState<Tab>(() => {
    if (typeof window === "undefined") {
      return "home";
    }

    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    return requestedTab === "ai" ||
      requestedTab === "lawyers" ||
      requestedTab === "wallet" ||
      requestedTab === "profile" ||
      requestedTab === "lawyer-verification"
      ? requestedTab
      : "home";
  });
  const [noticeRefresh, setNoticeRefresh] = useState(0);
  const [activeCall, setActiveCall] = useState<{
    consultationId: string;
    peerName: string;
    ratePerMinute: number;
    role: "worker" | "lawyer";
    lawyerUid?: string;
    workerLanguage?: SupportedLocale;
    workerNationality?: string;
    translationMode?: "none" | "subtitle_assist";
  } | null>(null);
  const [postCall, setPostCall] = useState<{
    consultationId: string;
    lawyerUid: string;
    lawyerName: string;
    durationSec: number;
    chargedPoints: number;
  } | null>(null);
  const [lawyerCelebration, setLawyerCelebration] = useState<{
    earnedPoints: number;
    durationSec: number;
  } | null>(null);
  const isLawyer = user?.role === "lawyer";

  const handleStartCall = async (lawyerUid: string, lawyerName: string, rate: number) => {
    if (!user) return;
    try {
      const res = await authenticatedFetch("/api/consultation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerUid: user.uid,
          lawyerUid,
          ratePerMinute: rate,
        }),
      });
      const data = await res.json();
      if (data.error === "INSUFFICIENT_BALANCE") {
        alert(interpolate(t.app.insufficientBalance, { required: data.required, balance: data.balance }));
        setCurrentTab("wallet");
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setActiveCall({
        consultationId: data.consultationId,
        peerName: lawyerName,
        ratePerMinute: data.ratePerMinute || rate,
        role: "worker",
        lawyerUid,
        workerLanguage: data.workerLanguage || user.language || locale,
        workerNationality: data.workerNationality || user.nationality || "",
        translationMode: data.translationMode || "none",
      });
    } catch (err) {
      console.error("Start call error:", err);
      alert(err instanceof Error ? err.message : t.app.callFailed);
    }
  };

  const handleCallEnd = async (durationSec: number) => {
    if (!activeCall) return;
    const callInfo = { ...activeCall };
    setActiveCall(null);
    try {
      const res = await authenticatedFetch("/api/consultation/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationId: callInfo.consultationId,
          durationSec,
        }),
      });
      const data = await res.json();

      if (callInfo.role === "worker" && callInfo.lawyerUid) {
        setPostCall({
          consultationId: callInfo.consultationId,
          lawyerUid: callInfo.lawyerUid,
          lawyerName: callInfo.peerName,
          durationSec,
          chargedPoints: data.chargePoints || Math.max(1, Math.ceil(durationSec / 60)) * callInfo.ratePerMinute,
        });
      }
      if (callInfo.role === "lawyer" && (data.lawyerPayoutPoints || 0) > 0) {
        setLawyerCelebration({
          earnedPoints: data.lawyerPayoutPoints,
          durationSec,
        });
      }
    } catch (err) {
      console.error("End call error:", err);
    }
  };

  const noticeKey = user ? `lawbridge-lawyer-notice:${user.uid}` : "";
  const shouldShowLawyerNotice =
    noticeRefresh >= 0 &&
    Boolean(
      isLawyer &&
        noticeKey &&
        typeof window !== "undefined" &&
        !window.localStorage.getItem(noticeKey)
    );

  const navItems = isLawyer
    ? [
        { key: "home" as const, label: t.nav.dashboard, icon: <BarChart3 className="h-5 w-5" /> },
        { key: "lawyers" as const, label: t.nav.lawyerDesk, icon: <Phone className="h-5 w-5" /> },
        { key: "ai" as const, label: t.nav.legalAi, icon: <MessageCircle className="h-5 w-5" /> },
        { key: "wallet" as const, label: t.nav.earnings, icon: <Wallet className="h-5 w-5" /> },
        { key: "profile" as const, label: t.nav.profile, icon: <User className="h-5 w-5" /> },
      ]
    : [
        { key: "home" as const, label: t.nav.home, icon: <Scale className="h-5 w-5" /> },
        { key: "ai" as const, label: t.nav.ragAi, icon: <MessageCircle className="h-5 w-5" /> },
        { key: "lawyers" as const, label: t.nav.findLawyer, icon: <Phone className="h-5 w-5" /> },
        { key: "wallet" as const, label: t.nav.wallet, icon: <Wallet className="h-5 w-5" /> },
        { key: "profile" as const, label: t.nav.profile, icon: <User className="h-5 w-5" /> },
      ];

  const acknowledgeLawyerNotice = () => {
    if (noticeKey) {
      window.localStorage.setItem(noticeKey, "1");
    }
    setNoticeRefresh((value) => value + 1);
  };

  return (
    <div className="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="brand-surface sticky top-4 z-20 rounded-[1.8rem] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <BrandLogo size={46} onClick={() => setCurrentTab("home")} />
            <div className="flex flex-wrap items-center gap-3">
              <PwaInstallButton locale={locale} />
              <LocaleMenu value={locale} onChange={onLocaleChange} />
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-ink)] px-4 py-2 text-sm text-white transition hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                {t.app.signOut}
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="brand-surface hidden rounded-[1.8rem] p-5 lg:block">
            <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t.app.account}</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {user?.displayName || user?.email}
              </p>
              <p className="mt-1 text-sm text-slate-500">{user?.email}</p>
              <p className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {isLawyer ? t.app.roleLawyer : t.app.roleWorker}
              </p>
            </div>

            <div className="mt-4 rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{t.app.status}</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {isLawyer ? t.app.lawyerStatus : t.app.workerStatus}
              </p>
            </div>

            <nav className="mt-4 space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCurrentTab(item.key)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition ${
                    currentTab === item.key
                      ? "bg-[var(--brand-ink)] text-white shadow-lg"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="brand-surface rounded-[1.8rem] p-4 sm:p-6">
            {currentTab === "home" && isLawyer ? (
              <LawyerDashboard locale={locale} onNavigate={(tab) => setCurrentTab(tab as Tab)} />
            ) : null}

            {currentTab === "home" && !isLawyer ? (
              <section className="space-y-5">
                <div className="brand-hero overflow-hidden rounded-[1.8rem] px-5 py-7 text-white sm:px-8">
                  <div className="max-w-2xl">
                    <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/78">
                      {t.app.eyebrow}
                    </span>
                    <h1 className="brand-title mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
                      {t.app.workerTitle}
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-white/84">
                      {t.app.workerBody}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                  <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{t.app.quick}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <ActionCard
                        icon={<MessageCircle className="h-6 w-6 text-emerald-600" />}
                        title={t.nav.ragAi}
                        subtitle={t.app.referenceOnly}
                        onClick={() => setCurrentTab("ai")}
                      />
                      <ActionCard
                        icon={<Phone className="h-6 w-6 text-sky-600" />}
                        title={t.nav.findLawyer}
                        subtitle={t.app.lawyerAction}
                        onClick={() => setCurrentTab("lawyers")}
                      />
                      <ActionCard
                        icon={<Wallet className="h-6 w-6 text-amber-600" />}
                        title={t.nav.wallet}
                        subtitle={t.app.walletAction}
                        onClick={() => setCurrentTab("wallet")}
                      />
                    </div>
                  </div>

                  <NoticeCard
                    title={t.app.workerNoticeTitle}
                    items={t.app.workerNoticeItems}
                  />
                </div>
              </section>
            ) : null}

            {currentTab === "ai" ? <AiChatPage locale={locale} /> : null}
            {currentTab === "lawyers" ? (
              <LawyerListPage
                locale={locale}
                viewerRole={user?.role ?? "worker"}
                onStartCall={handleStartCall}
                onNavigate={(tab) => setCurrentTab(tab as Tab)}
              />
            ) : null}
            {currentTab === "lawyer-verification" ? (
              <LawyerVerificationPage
                locale={locale}
                onBack={() => setCurrentTab("lawyers")}
              />
            ) : null}
            {currentTab === "wallet" ? (
              isLawyer ? <LawyerWalletPage locale={locale} /> : <WalletPage locale={locale} />
            ) : null}
            {currentTab === "profile" ? (
              <ProfilePage locale={locale} />
            ) : null}
          </main>
        </div>

        <nav className="brand-surface sticky bottom-3 z-20 rounded-[1.6rem] px-3 py-2 lg:hidden">
          <div className="grid grid-cols-5 gap-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setCurrentTab(item.key)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] transition ${
                  currentTab === item.key ? "bg-[var(--brand-ink)] text-white" : "text-slate-500"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {shouldShowLawyerNotice ? (
        <LegalNoticeModal
          title={t.app.modalTitle}
          body={t.app.modalBody}
          items={t.app.modalItems}
          acknowledgeLabel={t.app.acknowledge}
          onAcknowledge={acknowledgeLawyerNotice}
        />
      ) : null}

      {isLawyer && user && !activeCall ? (
        <IncomingCallBanner
          lawyerUid={user.uid}
          locale={locale}
          onAccept={(call) => {
            setActiveCall({
              consultationId: call.consultationId,
              peerName: call.workerDisplayName || "Worker",
              ratePerMinute: call.ratePerMinute,
              role: "lawyer",
              workerLanguage: call.workerLanguage,
              workerNationality: call.workerNationality,
              translationMode: call.translationMode,
            });
          }}
        />
      ) : null}

      {activeCall && user ? (
        <CallWindow
          consultationId={activeCall.consultationId}
          role={activeCall.role}
          peerName={activeCall.peerName}
          ratePerMinute={activeCall.ratePerMinute}
          locale={locale}
          workerLanguage={activeCall.workerLanguage}
          workerNationality={activeCall.workerNationality}
          translationMode={activeCall.translationMode}
          onEnd={handleCallEnd}
          onError={(msg) => {
            console.error("Call error:", msg);
            setActiveCall(null);
          }}
        />
      ) : null}

      {postCall && user ? (
        <PostCallRating
          consultationId={postCall.consultationId}
          workerUid={user.uid}
          lawyerUid={postCall.lawyerUid}
          lawyerName={postCall.lawyerName}
          durationSec={postCall.durationSec}
          chargedPoints={postCall.chargedPoints}
          locale={locale}
          onClose={() => setPostCall(null)}
        />
      ) : null}

      {lawyerCelebration ? (
        <LawyerPayoutCelebration
          earnedPoints={lawyerCelebration.earnedPoints}
          durationSec={lawyerCelebration.durationSec}
          locale={locale}
          onClose={() => setLawyerCelebration(null)}
          onViewWallet={() => {
            setLawyerCelebration(null);
            setCurrentTab("wallet");
          }}
        />
      ) : null}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-[rgba(184,100,67,0.38)] hover:bg-white hover:shadow-lg"
    >
      <div className="flex items-center gap-3">{icon}</div>
      <p className="mt-4 text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
    </button>
  );
}

function NoticeCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{title}</p>
      <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
        {items.map((item) => (
          <li key={item} className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfilePage({ locale }: { locale: SupportedLocale }) {
  const { user } = useAuthContext();
  const t = useTranslation(locale);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const selectedConsultationId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("consultationId")
      : "";

  useEffect(() => {
    if (!user) return;
    async function fetchHistory() {
      try {
        const field = user!.role === "lawyer" ? "lawyerUid" : "workerUid";
        const q = query(
          collection(db, "consultations"),
          where(field, "==", user!.uid),
          where("status", "==", "completed"),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const snap = await getDocs(q);
        setConsultations(snap.docs.map((d) => d.data() as Consultation));
      } catch {
        // Query may fail if index doesn't exist
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, [user]);

  if (!user) return null;
  const isLawyer = user.role === "lawyer";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-slate-100">
            <User className="h-10 w-10 text-slate-500" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-2xl font-semibold text-slate-900">{user.displayName || user.email}</p>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                <Shield className="h-3.5 w-3.5" />
                {isLawyer ? t.profile.lawyerAccount : t.profile.workerAccount}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                {t.profile.statusActive}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">{t.profile.accountUid}</p>
            <p className="mt-1 truncate text-sm font-mono text-slate-700">{user.uid}</p>
          </div>
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">{t.profile.language}</p>
            <p className="mt-1 text-sm text-slate-700">{user.language || locale}</p>
          </div>
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">{t.profile.created}</p>
            <p className="mt-1 text-sm text-slate-700">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString(locale === "zh-TW" ? "zh-TW" : "en") : "\u2014"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-sky-600" />
          <h3 className="text-lg font-semibold text-slate-900">{t.profile.consultationHistory}</h3>
        </div>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : consultations.length === 0 ? (
          <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            {t.profile.noHistory}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {consultations.map((c) => (
              <div
                key={c.id}
                className={`rounded-[1.2rem] px-4 py-4 ${
                  c.id === selectedConsultationId
                    ? "border border-sky-200 bg-sky-50"
                    : "bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {t.common.voiceConsultation}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(c.createdAt).toLocaleString(locale === "zh-TW" ? "zh-TW" : "en")}
                      {" \u00b7 "}
                      {Math.ceil(c.durationSec / 60)} {t.common.min}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${isLawyer ? "text-emerald-600" : "text-red-500"}`}>
                    {isLawyer ? "+" : "-"}{isLawyer ? c.lawyerPayoutPoints : c.chargePoints} {t.common.pts}
                  </span>
                </div>
                <ConsultationRecordingPanel consultation={c} locale={locale} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LegalNoticeModal({
  title,
  body,
  items,
  acknowledgeLabel,
  onAcknowledge,
}: {
  title: string;
  body: string;
  items: string[];
  acknowledgeLabel: string;
  onAcknowledge: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/40 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">LawBridge</p>
        <h2 className="brand-title mt-4 text-3xl text-slate-900">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-slate-600">{body}</p>
        <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
          {items.map((item) => (
            <li key={item} className="rounded-[1.2rem] bg-slate-50 px-4 py-3">
              {item}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-6 inline-flex items-center justify-center rounded-[1.2rem] bg-[var(--brand-ink)] px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {acknowledgeLabel}
        </button>
      </div>
    </div>
  );
}
