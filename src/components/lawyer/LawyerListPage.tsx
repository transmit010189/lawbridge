"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Coins,
  Globe2,
  Loader2,
  Phone,
  QrCode,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { SkeletonList } from "@/components/Skeleton";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import { localeNames } from "@/lib/i18n";
import { QRCodeScanner } from "./QRCodeScanner";
import type { LawyerProfile, SupportedLocale, UserRole } from "@/types";

interface Props {
  locale: SupportedLocale;
  viewerRole: UserRole;
  onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void;
  onNavigate?: (tab: string) => void;
}

const BASE_RATE_PER_MINUTE = 25;

const DEMO_LAWYERS: LawyerProfile[] = [
  {
    uid: "demo-1",
    fullName: "林以安 律師",
    licenseNo: "台北律字第 291 號",
    licenseStatus: "verified",
    verificationStage: "verified",
    verifiedName: "林以安",
    specialties: ["勞動契約", "職災申訴", "外籍勞工"],
    serviceLanguages: ["zh-TW"],
    translationAssistEnabled: true,
    payoutScheduleNote: "完成 KYC 後可查看正式撥款時程。",
    payoutEtaNote: "平台內收益紀錄可追蹤。",
    ratingAvg: 4.9,
    ratingCount: 126,
    bio: "專注勞資爭議與移工申訴，擅長把複雜程序講清楚，讓當事人知道下一步怎麼做。",
    ratePerMinute: 25,
    isOnline: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    uid: "demo-2",
    fullName: "陳宥廷 律師",
    licenseNo: "高雄律字第 502 號",
    licenseStatus: "verified",
    verificationStage: "verified",
    verifiedName: "陳宥廷",
    specialties: ["轉換雇主", "仲介爭議", "行政申訴"],
    serviceLanguages: ["zh-TW"],
    translationAssistEnabled: true,
    payoutScheduleNote: "完成 KYC 後可查看正式撥款時程。",
    payoutEtaNote: "平台內收益紀錄可追蹤。",
    ratingAvg: 4.8,
    ratingCount: 89,
    bio: "處理外籍勞工居留、轉換雇主與仲介爭議，擅長快速盤點風險與可行方案。",
    ratePerMinute: 35,
    isOnline: true,
    createdAt: "",
    updatedAt: "",
  },
];

function normalizeRate(rate?: number) {
  return Math.max(BASE_RATE_PER_MINUTE, Number(rate || 0) || BASE_RATE_PER_MINUTE);
}

function copy(locale: SupportedLocale) {
  const zh = locale === "zh-TW";

  return {
    workerTitle: zh ? "尋找已驗證律師" : "Find verified lawyers",
    workerSubtitle: zh
      ? "只顯示已完成證照與撥款帳戶驗證的律師。外勞端只需要看費率、專長與是否可立即通話。"
      : "Only lawyers with completed identity and payout verification are shown here.",
    search: zh ? "搜尋律師姓名、專長或關鍵字" : "Search by lawyer name, specialty, or keyword",
    workerTipsTitle: zh ? "通話前你會知道" : "Before you call",
    workerTips: zh
      ? [
          "每分鐘收費會先明確顯示，點數不足時會先提醒加點。",
          "來電後可看到對方是否支援翻譯輔助與目前是否在線。",
          "整段通話將保留錄音留存，只有該次參與者可以存取。",
        ]
      : [
          "The per-minute rate is always visible before the call starts.",
          "You can see whether the lawyer is online and whether translation assist is enabled.",
          "Recordings remain participant-only after the call.",
        ],
    workerDemoBanner: zh
      ? "目前顯示示範律師資料，語言切換時此提示會同步切換。"
      : "Demo lawyer data is currently shown. This banner now follows language changes.",
    workerNoResult: zh ? "找不到符合條件的律師。" : "No matching lawyers found.",
    verified: zh ? "已驗證" : "Verified",
    available: zh ? "可立即通話" : "Available now",
    profileOnly: zh ? "僅看資料" : "Profile only",
    callNow: zh ? "立即通話" : "Call now",
    pricing: zh ? "收費" : "Pricing",
    pointsPerMin: zh ? "點 / 分" : "pts / min",
    translationAssist: zh ? "翻譯輔助" : "Translation assist",
    lawyerDeskTitle: zh ? "律師工作台" : "Lawyer workspace",
    lawyerDeskSubtitle: zh
      ? "把驗證、收益、翻譯服務與 QR 工具拆開，工作台只保留已驗證後會反覆使用的操作。"
      : "Keep verification, earnings, translation, and QR tools separated so the desk stays focused on daily work.",
    verificationReady: zh ? "已完成驗證" : "Verified",
    verificationPending: zh ? "尚未完成驗證" : "Verification pending",
    payoutReady: zh ? "收款帳戶已驗證" : "Payout account verified",
    payoutPending: zh ? "收款帳戶待驗證" : "Payout account pending",
    verificationCta: zh ? "前往驗證中心" : "Open verification center",
    verificationDone: zh ? "查看驗證結果" : "View verification result",
    online: zh ? "上線接聽" : "Go online",
    offline: zh ? "暫停接聽" : "Go offline",
    profileTitle: zh ? "公開專業資料" : "Public profile",
    publicName: zh ? "公開顯示名稱" : "Public display name",
    licenseNo: zh ? "律師字號" : "License number",
    bio: zh ? "專業簡介" : "Professional bio",
    specialties: zh ? "專長領域" : "Specialties",
    rate: zh ? "每分鐘費率" : "Rate per minute",
    save: zh ? "儲存工作台資料" : "Save profile",
    saved: zh ? "工作台資料已更新。" : "Profile updated.",
    noProfile: zh ? "完成驗證後會自動建立律師檔案。" : "A lawyer profile will be created after verification.",
    qrTitle: zh ? "手機 QR 工具" : "Mobile QR tools",
    qrSubtitle: zh ? "掃描案件、付款或平台 QR，直接導向對應頁面。" : "Scan case, payment, or platform QR codes.",
    translationBlockTitle: zh ? "翻譯服務定位" : "Translation positioning",
    translationBlockBody: zh
      ? "服務語言不必由律師事前勾選；平台會依外勞的國籍與語言自動帶出通話翻譯輔助。"
      : "Lawyers no longer need to pre-select service languages. The app derives translation assist from worker language and nationality.",
    rateHint: zh
      ? `建議起跳 ${BASE_RATE_PER_MINUTE} 點 / 分，可依經驗與時段再往上調整。`
      : `Recommended floor: ${BASE_RATE_PER_MINUTE} pts / min.`,
  };
}

export function LawyerListPage({
  locale,
  viewerRole,
  onStartCall,
  onNavigate,
}: Props) {
  if (viewerRole === "lawyer") {
    return <LawyerWorkspace locale={locale} onNavigate={onNavigate} />;
  }

  return (
    <WorkerLawyerDirectory
      locale={locale}
      onStartCall={onStartCall}
    />
  );
}

function WorkerLawyerDirectory({
  locale,
  onStartCall,
}: {
  locale: SupportedLocale;
  onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void;
}) {
  const c = useMemo(() => copy(locale), [locale]);
  const [lawyers, setLawyers] = useState<LawyerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function fetchLawyers() {
      try {
        const snapshot = await getDocs(collection(db, "lawyer_profiles"));
        const rows = snapshot.docs
          .map((item) => item.data() as LawyerProfile)
          .filter((item) => item.licenseStatus === "verified")
          .sort((left, right) => {
            if (right.isOnline !== left.isOnline) {
              return Number(right.isOnline) - Number(left.isOnline);
            }
            return right.ratingAvg - left.ratingAvg;
          });

        if (rows.length === 0) {
          setLawyers(DEMO_LAWYERS);
          setIsDemo(true);
        } else {
          setLawyers(rows);
          setIsDemo(false);
        }
      } catch (error) {
        console.error("Fetch lawyers error:", error);
        setLawyers(DEMO_LAWYERS);
        setIsDemo(true);
      } finally {
        setLoading(false);
      }
    }

    void fetchLawyers();
  }, []);

  const keyword = searchTerm.trim().toLowerCase();
  const filteredLawyers = lawyers.filter((lawyer) => {
    if (!keyword) {
      return true;
    }
    return (
      lawyer.fullName.toLowerCase().includes(keyword) ||
      lawyer.specialties.some((specialty) =>
        specialty.toLowerCase().includes(keyword)
      ) ||
      lawyer.bio.toLowerCase().includes(keyword)
    );
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="animate-pulse rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-6 w-48 rounded-lg bg-slate-100" />
          <div className="mt-3 h-4 w-80 rounded-lg bg-slate-100" />
          <div className="mt-5 h-11 w-full rounded-[1.3rem] bg-slate-100" />
        </div>
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_45%),linear-gradient(135deg,#0f172a,#1e293b)] px-6 py-6 text-white">
            <h2 className="text-3xl font-semibold">{c.workerTitle}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
              {c.workerSubtitle}
            </p>
          </div>

          <div className="p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={c.search}
                className="w-full rounded-[1.3rem] border border-slate-200 px-12 py-3 text-sm outline-none transition focus:border-[rgba(184,100,67,0.45)] focus:ring-4 focus:ring-[rgba(184,100,67,0.08)]"
              />
            </div>

            {isDemo ? (
              <p className="mt-4 rounded-[1.2rem] bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {c.workerDemoBanner}
              </p>
            ) : null}
          </div>
        </div>

        <InfoPanel title={c.workerTipsTitle} items={c.workerTips} />
      </div>

      {filteredLawyers.length === 0 ? (
        <div className="rounded-[1.6rem] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
          {c.workerNoResult}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredLawyers.map((lawyer) => (
            <LawyerCard
              key={lawyer.uid}
              lawyer={lawyer}
              locale={locale}
              onStartCall={onStartCall}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LawyerWorkspace({
  locale,
  onNavigate,
}: {
  locale: SupportedLocale;
  onNavigate?: (tab: string) => void;
}) {
  const { user } = useAuthContext();
  const c = useMemo(() => copy(locale), [locale]);
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formName, setFormName] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formSpecialties, setFormSpecialties] = useState("");
  const [formRate, setFormRate] = useState(BASE_RATE_PER_MINUTE);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      const snap = await getDoc(doc(db, "lawyer_profiles", user.uid));
      if (snap.exists()) {
        const data = snap.data() as LawyerProfile;
        setProfile(data);
        setIsOnline(data.isOnline);
        setFormName(data.fullName || user.displayName || "");
        setFormBio(data.bio);
        setFormSpecialties(data.specialties.join(", "));
        setFormRate(normalizeRate(data.ratePerMinute));
      } else {
        setProfile(null);
        setFormName(user.displayName || "");
        setFormRate(BASE_RATE_PER_MINUTE);
      }
    } catch (error) {
      console.error("Fetch lawyer profile error:", error);
    } finally {
      setLoadingProfile(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const verificationReady = profile?.licenseStatus === "verified";
  const payoutReady = Boolean(profile?.payoutAccountVerified);
  const verificationLabel = verificationReady
    ? c.verificationReady
    : c.verificationPending;

  const toggleOnline = async () => {
    if (!user || !profile || !verificationReady) {
      return;
    }

    setToggling(true);
    const nextStatus = !isOnline;
    try {
      await updateDoc(doc(db, "lawyer_profiles", user.uid), {
        isOnline: nextStatus,
        updatedAt: new Date().toISOString(),
      });
      setIsOnline(nextStatus);
      setProfile((current) =>
        current ? { ...current, isOnline: nextStatus } : current
      );
    } catch (error) {
      console.error("Toggle online error:", error);
    } finally {
      setToggling(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    const now = new Date().toISOString();
    const payload: Partial<LawyerProfile> = {
      fullName: formName.trim() || profile?.fullName || user.displayName || "",
      bio: formBio.trim(),
      specialties: formSpecialties
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      ratePerMinute: normalizeRate(formRate),
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, "lawyer_profiles", user.uid), payload, { merge: true });
      await refreshProfile();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } catch (error) {
      console.error("Save lawyer profile error:", error);
    }
  };

  if (loadingProfile) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_36%),linear-gradient(135deg,#0f172a,#111827)] px-6 py-7 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-white/60">
                LawBridge Counsel
              </p>
              <h2 className="mt-3 text-3xl font-semibold">{c.lawyerDeskTitle}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">
                {c.lawyerDeskSubtitle}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <HighlightBadge icon={<ShieldCheck className="h-4 w-4" />} label={verificationLabel} />
              <HighlightBadge icon={<WalletCards className="h-4 w-4" />} label={payoutReady ? c.payoutReady : c.payoutPending} />
              <HighlightBadge icon={<Sparkles className="h-4 w-4" />} label={c.translationAssist} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-200 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard icon={<BadgeCheck className="h-5 w-5 text-emerald-600" />} label={c.licenseNo} value={profile?.licenseNo || "—"} />
            <SummaryCard icon={<Coins className="h-5 w-5 text-amber-600" />} label={c.rate} value={`${normalizeRate(profile?.ratePerMinute)} ${c.pointsPerMin}`} />
            <SummaryCard icon={<Globe2 className="h-5 w-5 text-sky-600" />} label={c.translationAssist} value={localeNames[locale] || locale} />
            <SummaryCard icon={<QrCode className="h-5 w-5 text-violet-600" />} label={c.qrTitle} value={c.qrSubtitle} />
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onNavigate?.("lawyer-verification")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <ShieldCheck className="h-4 w-4" />
              {verificationReady ? c.verificationDone : c.verificationCta}
            </button>
            <button
              type="button"
              onClick={toggleOnline}
              disabled={toggling || !verificationReady}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] px-5 py-3 text-sm font-medium transition ${
                verificationReady
                  ? isOnline
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              {toggling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isOnline ? (
                <WifiOff className="h-4 w-4" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {isOnline ? c.offline : c.online}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <InfoPanel
          title={locale === "zh-TW" ? "驗證與信任" : "Trust and verification"}
          items={
            locale === "zh-TW"
              ? [
                  "律師字號由 OCR 自動帶入，工作台只顯示結果，不開放手動輸入。",
                  "帳戶姓名與證照姓名不一致時，會轉人工複核與客服視訊驗證。",
                  "認證作業已搬到獨立驗證中心；完成後工作台只顯示結果與狀態。",
                ]
              : [
                  "License numbers are auto-filled from OCR and remain read-only.",
                  "Name mismatches escalate to manual and video review.",
                  "Verification now lives in a separate center instead of staying on the main desk.",
                ]
          }
        />

        <InfoPanel title={c.translationBlockTitle} items={[c.translationBlockBody, c.rateHint]} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                {c.profileTitle}
              </p>
              <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                {profile?.fullName || user?.displayName || "Lawyer"}
              </h3>
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
              {verificationLabel}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label={c.publicName}>
              <input
                type="text"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                className="w-full rounded-[1.1rem] border border-slate-200 px-4 py-3 text-sm outline-none"
              />
            </Field>

            <Field label={c.licenseNo}>
              <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {profile?.licenseNo || "—"}
              </div>
            </Field>

            <Field label={c.rate}>
              <input
                type="number"
                min={BASE_RATE_PER_MINUTE}
                max={300}
                step={5}
                value={formRate}
                onChange={(event) => setFormRate(Number(event.target.value))}
                className="w-full rounded-[1.1rem] border border-slate-200 px-4 py-3 text-sm outline-none"
              />
            </Field>

            <Field label={c.specialties}>
              <input
                type="text"
                value={formSpecialties}
                onChange={(event) => setFormSpecialties(event.target.value)}
                placeholder={
                  locale === "zh-TW"
                    ? "勞動契約, 外籍勞工, 申訴與調解"
                    : "Labor contracts, migrant workers, dispute resolution"
                }
                className="w-full rounded-[1.1rem] border border-slate-200 px-4 py-3 text-sm outline-none"
              />
            </Field>
          </div>

          <Field label={c.bio} className="mt-4">
            <textarea
              value={formBio}
              onChange={(event) => setFormBio(event.target.value)}
              rows={4}
              className="w-full rounded-[1.1rem] border border-slate-200 px-4 py-3 text-sm outline-none"
            />
          </Field>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveProfile}
              className="rounded-[1.2rem] bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              {c.save}
            </button>
            {saved ? <span className="text-sm text-emerald-700">{c.saved}</span> : null}
            {!profile ? <span className="text-sm text-slate-500">{c.noProfile}</span> : null}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100">
                <ScanSearch className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{c.translationBlockTitle}</p>
                <p className="text-sm text-slate-500">{c.translationBlockBody}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-900">{c.qrTitle}</p>
              <p className="text-sm text-slate-500">{c.qrSubtitle}</p>
            </div>
            <QRCodeScanner />
          </div>
        </div>
      </div>
    </div>
  );
}

function LawyerCard({
  lawyer,
  locale,
  onStartCall,
}: {
  lawyer: LawyerProfile;
  locale: SupportedLocale;
  onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void;
}) {
  const c = useMemo(() => copy(locale), [locale]);
  const displayRate = normalizeRate(lawyer.ratePerMinute);

  return (
    <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-slate-900">{lawyer.fullName}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              {c.verified}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                lawyer.isOnline ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {lawyer.isOnline ? c.available : c.profileOnly}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-400">{lawyer.licenseNo}</p>
          <p className="mt-4 text-sm leading-7 text-slate-600">{lawyer.bio}</p>
        </div>

        <div className="rounded-[1.4rem] bg-slate-50 px-4 py-3 text-left sm:min-w-[170px]">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
            {c.pricing}
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900">
            {displayRate} {c.pointsPerMin}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {lawyer.specialties.map((specialty) => (
          <span
            key={specialty}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
          >
            {specialty}
          </span>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-end border-t border-slate-100 pt-4">
        {lawyer.isOnline && onStartCall ? (
          <button
            type="button"
            onClick={() => onStartCall(lawyer.uid, lawyer.fullName, displayRate)}
            className="inline-flex items-center gap-2 rounded-[1.2rem] bg-emerald-500 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            <Phone className="h-4 w-4" />
            {c.callNow}
          </button>
        ) : (
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
            {c.profileOnly}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[1.8rem] border border-slate-200 bg-white p-5 shadow-sm">
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

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
          <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function HighlightBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/16 bg-white/10 px-3 py-2 text-xs text-white/82">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}
