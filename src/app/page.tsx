"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  LogOut,
  MessageCircle,
  Phone,
  Scale,
  User,
  Wallet,
  History,
  Shield,
} from "lucide-react";
import { doc, getDoc, collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { AuthProvider, useAuthContext } from "@/components/auth/AuthProvider";
import { LoginPage } from "@/components/auth/LoginPage";
import { BrandLogo } from "@/components/branding/BrandLogo";
import { LocaleMenu } from "@/components/branding/LocaleMenu";
import { AiChatPage } from "@/components/consultation/AiChatPage";
import { CallWindow } from "@/components/consultation/CallWindow";
import { IncomingCallBanner } from "@/components/consultation/IncomingCallBanner";
import { PostCallRating } from "@/components/consultation/PostCallRating";
import { LawyerListPage } from "@/components/lawyer/LawyerListPage";
import { WalletPage } from "@/components/wallet/WalletPage";
import { db } from "@/lib/firebase/client";
import { locales } from "@/lib/i18n";
import type { SupportedLocale, Consultation } from "@/types";

type Tab = "home" | "ai" | "lawyers" | "wallet" | "profile";

const en = {
  loading: "Preparing LawBridge...",
  signOut: "Sign out",
  home: "Home",
  ai: "RAG Legal AI",
  lawyersWorker: "Lawyer Help",
  lawyersLawyer: "Lawyer Desk",
  wallet: "Wallet",
  profile: "Profile",
  roleWorker: "Need legal help",
  roleLawyer: "Lawyer account",
  eyebrow: "LawBridge",
  workerTitle: "Search the regulations first, then decide whether to speak with a lawyer.",
  workerBody:
    "AI answers are reference only. Keep your original files and move to a lawyer when the case becomes specific.",
  lawyerTitle: "Review the platform notice first, then prepare the lawyer workspace.",
  lawyerBody:
    "This public build focuses on account, profile, and reference flows. Direct calls and evidence-chain tools are not live yet.",
  quick: "Quick access",
  referenceOnly: "Reference only",
  lawyerAction: "Browse lawyer profiles and service notes",
  lawyerDeskAction: "Read obligations and current scope",
  walletAction: "Check points and transaction status",
  workerNoticeTitle: "Before you continue",
  workerNoticeItems: [
    "AI answers are not formal legal advice.",
    "Keep original documents and timing records by yourself.",
    "Use the cited regulations and a licensed lawyer for case-specific action.",
  ],
  lawyerNoticeTitle: "Lawyer reminder",
  lawyerNoticeItems: [
    "Confirm the service boundary before providing any legal service.",
    "Direct calls, recording retention, and evidence-chain tools are not live yet.",
    "Do not request unnecessary personal data outside the platform.",
  ],
  account: "Account",
  status: "Current status",
  workerStatus: "RAG answers, lawyer browsing, and wallet pages are available in this build.",
  lawyerStatus: "You are viewing the lawyer-specific workspace and compliance flow.",
  modalTitle: "Lawyer notice",
  modalBody:
    "Before using this account to provide legal services, please review the service boundary and your professional obligations.",
  modalItems: [
    "Do not imply a formal representation relationship before the required steps are complete.",
    "Handle confidentiality and personal-data processing according to applicable rules.",
    "Current public testing does not include direct calls, recordings, or evidence-chain storage.",
  ],
  acknowledge: "I understand",
  profileTitle: "Profile",
  profileHint: "This page currently shows basic account information only.",
};

const zh = {
  loading: "正在載入 LawBridge...",
  signOut: "登出",
  home: "首頁",
  ai: "RAG 法律 AI",
  lawyersWorker: "律師協助",
  lawyersLawyer: "律師工作台",
  wallet: "錢包",
  profile: "個人資料",
  roleWorker: "需要法律協助",
  roleLawyer: "律師帳戶",
  eyebrow: "LawBridge",
  workerTitle: "先查法規，再決定是否找律師。",
  workerBody:
    "AI 回答僅供參考。若涉及真實爭議，請保留原始文件與時間紀錄，再改看正式法律意見。",
  lawyerTitle: "先閱讀平台聲明，再處理律師工作台資料。",
  lawyerBody:
    "公開測試版本目前以帳戶、資料瀏覽與參考流程為主。直接通話、錄音留存與證據鏈工具尚未上線。",
  quick: "快速入口",
  referenceOnly: "僅供參考",
  lawyerAction: "瀏覽律師資料與服務說明",
  lawyerDeskAction: "查看權利義務與目前功能範圍",
  walletAction: "查看點數與交易狀態",
  workerNoticeTitle: "使用提醒",
  workerNoticeItems: [
    "AI 回答不是正式法律意見。",
    "重要文件仍應自行保存原件與時間紀錄。",
    "如有個案爭議，請以原始法規與專業律師意見為準。",
  ],
  lawyerNoticeTitle: "律師執業提醒",
  lawyerNoticeItems: [
    "提供法律服務前，請再次確認是否成立委任或諮詢關係。",
    "平台目前尚未開放直接通話、錄音留存與證據鏈管理。",
    "請勿在平台外要求超出必要範圍的個資或文件。",
  ],
  account: "帳戶",
  status: "目前狀態",
  workerStatus: "目前可使用 RAG 問答、律師資料瀏覽與錢包頁。",
  lawyerStatus: "你目前看到的是律師專用工作台與聲明流程。",
  modalTitle: "律師權利義務聲明",
  modalBody:
    "在平台上提供任何法律服務前，請先確認服務邊界、保密義務、個資處理與委任關係。",
  modalItems: [
    "未完成必要程序前，不得讓使用者誤認已成立正式委任關係。",
    "請依適用規範處理保密、個資與執業責任。",
    "目前公開測試不包含直接通話、錄音留存與證據鏈保存功能。",
  ],
  acknowledge: "我已了解",
  profileTitle: "個人資料",
  profileHint: "此頁目前僅顯示基本帳戶資料。",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
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
  const copy = getCopy(locale);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="brand-surface flex w-full max-w-md flex-col items-center rounded-[2rem] px-8 py-12 text-center">
        <BrandLogo />
        <Loader2 className="mt-8 h-10 w-10 animate-spin text-[var(--brand-accent)]" />
        <p className="mt-4 text-sm text-slate-500">{copy.loading}</p>
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
  const [currentTab, setCurrentTab] = useState<Tab>("home");
  const [noticeRefresh, setNoticeRefresh] = useState(0);
  const [activeCall, setActiveCall] = useState<{
    consultationId: string;
    peerName: string;
    ratePerMinute: number;
    role: "worker" | "lawyer";
    lawyerUid?: string;
  } | null>(null);
  const [postCall, setPostCall] = useState<{
    consultationId: string;
    lawyerUid: string;
    lawyerName: string;
    durationSec: number;
    chargedPoints: number;
  } | null>(null);
  const copy = getCopy(locale);
  const isLawyer = user?.role === "lawyer";

  const handleStartCall = async (lawyerUid: string, lawyerName: string, rate: number) => {
    if (!user) return;
    try {
      const res = await fetch("/api/consultation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerUid: user.uid,
          lawyerUid,
          ratePerMinute: rate,
          languageFrom: locale,
          languageTo: "zh-TW",
        }),
      });
      const data = await res.json();
      if (data.error === "INSUFFICIENT_BALANCE") {
        alert(locale === "zh-TW"
          ? `餘額不足！需要至少 ${data.required} 點，目前有 ${data.balance} 點。請先儲值。`
          : `Insufficient balance! Need ${data.required} pts, have ${data.balance} pts. Please top up first.`);
        setCurrentTab("wallet");
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setActiveCall({
        consultationId: data.consultationId,
        peerName: lawyerName,
        ratePerMinute: rate,
        role: "worker",
        lawyerUid,
      });
    } catch (err) {
      console.error("Start call error:", err);
      alert(err instanceof Error ? err.message : "Failed to start call");
    }
  };

  const handleCallEnd = async (durationSec: number) => {
    if (!activeCall) return;
    const callInfo = { ...activeCall };
    try {
      const res = await fetch("/api/consultation/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultationId: callInfo.consultationId,
          durationSec,
        }),
      });
      const data = await res.json();

      // Show rating dialog for workers
      if (callInfo.role === "worker" && callInfo.lawyerUid) {
        setPostCall({
          consultationId: callInfo.consultationId,
          lawyerUid: callInfo.lawyerUid,
          lawyerName: callInfo.peerName,
          durationSec,
          chargedPoints: data.chargePoints || Math.max(1, Math.ceil(durationSec / 60)) * callInfo.ratePerMinute,
        });
      }
    } catch (err) {
      console.error("End call error:", err);
    }
    setActiveCall(null);
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

  const navItems = [
    { key: "home" as const, label: copy.home, icon: <Scale className="h-5 w-5" /> },
    { key: "ai" as const, label: copy.ai, icon: <MessageCircle className="h-5 w-5" /> },
    {
      key: "lawyers" as const,
      label: isLawyer ? copy.lawyersLawyer : copy.lawyersWorker,
      icon: <Phone className="h-5 w-5" />,
    },
    { key: "wallet" as const, label: copy.wallet, icon: <Wallet className="h-5 w-5" /> },
    { key: "profile" as const, label: copy.profile, icon: <User className="h-5 w-5" /> },
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
              <LocaleMenu value={locale} onChange={onLocaleChange} />
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-ink)] px-4 py-2 text-sm text-white transition hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                {copy.signOut}
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="brand-surface hidden rounded-[1.8rem] p-5 lg:block">
            <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{copy.account}</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">
                {user?.displayName || user?.email}
              </p>
              <p className="mt-1 text-sm text-slate-500">{user?.email}</p>
              <p className="mt-4 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {isLawyer ? copy.roleLawyer : copy.roleWorker}
              </p>
            </div>

            <div className="mt-4 rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">{copy.status}</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {isLawyer ? copy.lawyerStatus : copy.workerStatus}
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
            {currentTab === "home" ? (
              <section className="space-y-5">
                <div className="brand-hero overflow-hidden rounded-[1.8rem] px-5 py-7 text-white sm:px-8">
                  <div className="max-w-2xl">
                    <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/78">
                      {copy.eyebrow}
                    </span>
                    <h1 className="brand-title mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
                      {isLawyer ? copy.lawyerTitle : copy.workerTitle}
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-white/84">
                      {isLawyer ? copy.lawyerBody : copy.workerBody}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
                  <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{copy.quick}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <ActionCard
                        icon={<MessageCircle className="h-6 w-6 text-emerald-600" />}
                        title={copy.ai}
                        subtitle={copy.referenceOnly}
                        onClick={() => setCurrentTab("ai")}
                      />
                      <ActionCard
                        icon={<Phone className="h-6 w-6 text-sky-600" />}
                        title={isLawyer ? copy.lawyersLawyer : copy.lawyersWorker}
                        subtitle={isLawyer ? copy.lawyerDeskAction : copy.lawyerAction}
                        onClick={() => setCurrentTab("lawyers")}
                      />
                      <ActionCard
                        icon={<Wallet className="h-6 w-6 text-amber-600" />}
                        title={copy.wallet}
                        subtitle={copy.walletAction}
                        onClick={() => setCurrentTab("wallet")}
                      />
                    </div>
                  </div>

                  <NoticeCard
                    title={isLawyer ? copy.lawyerNoticeTitle : copy.workerNoticeTitle}
                    items={isLawyer ? copy.lawyerNoticeItems : copy.workerNoticeItems}
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
              />
            ) : null}
            {currentTab === "wallet" ? <WalletPage locale={locale} /> : null}
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
          title={copy.modalTitle}
          body={copy.modalBody}
          items={copy.modalItems}
          acknowledgeLabel={copy.acknowledge}
          onAcknowledge={acknowledgeLawyerNotice}
        />
      ) : null}

      {/* Incoming call banner for lawyers */}
      {isLawyer && user && !activeCall ? (
        <IncomingCallBanner
          lawyerUid={user.uid}
          locale={locale}
          onAccept={(call) => {
            setActiveCall({
              consultationId: call.consultationId,
              peerName: "Worker",
              ratePerMinute: call.ratePerMinute,
              role: "lawyer",
            });
          }}
        />
      ) : null}

      {/* Active call overlay */}
      {activeCall && user ? (
        <CallWindow
          consultationId={activeCall.consultationId}
          role={activeCall.role}
          peerName={activeCall.peerName}
          ratePerMinute={activeCall.ratePerMinute}
          locale={locale}
          onEnd={handleCallEnd}
          onError={(msg) => {
            console.error("Call error:", msg);
            setActiveCall(null);
          }}
        />
      ) : null}

      {/* Post-call rating dialog */}
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
  const isZh = locale === "zh-TW";
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

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
        // Query may fail if index doesn't exist — silently fail
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
      {/* Profile Card */}
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
                {isLawyer ? (isZh ? "律師帳戶" : "Lawyer") : (isZh ? "需求者帳戶" : "Worker")}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-700">
                {isZh ? "狀態：啟用" : "Status: Active"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">{isZh ? "帳戶 UID" : "Account UID"}</p>
            <p className="mt-1 truncate text-sm font-mono text-slate-700">{user.uid}</p>
          </div>
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">{isZh ? "偏好語言" : "Language"}</p>
            <p className="mt-1 text-sm text-slate-700">{user.language || locale}</p>
          </div>
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
            <p className="text-xs text-slate-400">{isZh ? "建立日期" : "Created"}</p>
            <p className="mt-1 text-sm text-slate-700">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString(locale === "zh-TW" ? "zh-TW" : "en") : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Consultation History */}
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-sky-600" />
          <h3 className="text-lg font-semibold text-slate-900">{isZh ? "諮詢紀錄" : "Consultation History"}</h3>
        </div>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : consultations.length === 0 ? (
          <div className="mt-4 rounded-[1.4rem] bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            {isZh ? "尚無諮詢紀錄。" : "No consultation history yet."}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {consultations.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-[1.2rem] bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {isZh ? "語音諮詢" : "Voice Consultation"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(c.createdAt).toLocaleString(isZh ? "zh-TW" : "en")}
                    {" · "}
                    {Math.ceil(c.durationSec / 60)}{isZh ? " 分鐘" : " min"}
                  </p>
                </div>
                <span className={`text-sm font-semibold ${isLawyer ? "text-emerald-600" : "text-red-500"}`}>
                  {isLawyer ? "+" : "-"}{isLawyer ? c.lawyerPayoutPoints : c.chargePoints} {isZh ? "點" : "pts"}
                </span>
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
