"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { BadgeCheck, Globe, Loader2, Phone, Search, Star } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { localeNames } from "@/lib/i18n";
import type { LawyerProfile, SupportedLocale, UserRole } from "@/types";

interface Props {
  locale: SupportedLocale;
  viewerRole: UserRole;
  onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void;
}

const DEMO_LAWYERS: LawyerProfile[] = [
  {
    uid: "demo-1",
    fullName: "林芷柔 律師",
    licenseNo: "台北律字第 291 號",
    licenseStatus: "verified",
    specialties: ["勞動契約", "薪資與加班", "外籍勞工"],
    serviceLanguages: ["zh-TW", "en", "id"],
    ratingAvg: 4.9,
    ratingCount: 126,
    bio: "處理勞資爭議、加班費與解僱案件，熟悉跨語言協作與文件整理。",
    ratePerMinute: 10,
    isOnline: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    uid: "demo-2",
    fullName: "陳柏穎 律師",
    licenseNo: "高雄律字第 502 號",
    licenseStatus: "verified",
    specialties: ["職災補償", "派遣與承攬", "調解程序"],
    serviceLanguages: ["zh-TW", "en", "vi"],
    ratingAvg: 4.7,
    ratingCount: 89,
    bio: "長期處理職災與勞保理賠爭議，擅長把案件時序與證據整理清楚。",
    ratePerMinute: 8,
    isOnline: true,
    createdAt: "",
    updatedAt: "",
  },
  {
    uid: "demo-3",
    fullName: "王語安 律師",
    licenseNo: "新北律字第 103 號",
    licenseStatus: "verified",
    specialties: ["移工法規", "申訴程序", "雇主義務"],
    serviceLanguages: ["zh-TW", "th", "en"],
    ratingAvg: 4.8,
    ratingCount: 64,
    bio: "熟悉移工與跨境雇用案件，能協助釐清雇主義務與申訴方向。",
    ratePerMinute: 12,
    isOnline: false,
    createdAt: "",
    updatedAt: "",
  },
];

const en = {
  workerTitle: "Lawyer Help",
  workerSubtitle:
    "You can browse lawyer profiles and specialties here. Direct calls, recording retention, and evidence-chain tools are not live yet.",
  search: "Search by name, specialty, or language...",
  available: "Available",
  offline: "Offline",
  perMinute: "pts / min",
  reviews: "reviews",
  noResult: "No matching lawyers found.",
  languages: "Languages",
  demo: "Showing demo lawyer data until real profiles are available in Firestore.",
  verified: "Verified",
  workerNoticeTitle: "Current scope",
  workerNoticeItems: [
    "The page currently shows verified lawyer profiles only.",
    "Direct call handling and recording retention are not implemented yet.",
    "Evidence-chain workflow is not implemented yet.",
  ],
  lawyerTitle: "Lawyer Desk",
  lawyerSubtitle: "This page is different from the worker-facing directory.",
  lawyerNoticeTitle: "Rights and obligations",
  lawyerNoticeItems: [
    "Confirm the service boundary before providing any legal opinion.",
    "Do not imply a formal representation relationship before the required steps are complete.",
    "Keep confidentiality and personal-data handling aligned with applicable rules.",
  ],
  lawyerScopeTitle: "Current implementation",
  lawyerScopeItems: [
    "Account, wallet, and lawyer-facing notice flow are available.",
    "Public worker-facing lawyer browsing is available.",
    "Direct calls, recordings, payouts, and evidence-chain management are still pending.",
  ],
  profileOnly: "Profile browsing only. Direct calls are not live yet.",
  startCall: "Start Call",
};

const zh = {
  workerTitle: "律師協助",
  workerSubtitle: "目前可瀏覽律師資料與專長。直接通話、錄音留存與證據鏈流程尚未開放。",
  search: "輸入姓名、專長或語言...",
  available: "可受理",
  offline: "離線",
  perMinute: "點 / 分",
  reviews: "則評價",
  noResult: "找不到符合條件的律師。",
  languages: "服務語言",
  demo: "目前顯示示範律師資料；真實資料加入後會自動替換。",
  verified: "已驗證",
  workerNoticeTitle: "目前狀態",
  workerNoticeItems: [
    "前端目前僅顯示已驗證的律師資料。",
    "直接通話與錄音留存功能尚未實裝。",
    "證據鏈流程尚未建置。",
  ],
  lawyerTitle: "律師工作台",
  lawyerSubtitle: "此頁面與需求者看到的律師名單不同。",
  lawyerNoticeTitle: "權利義務聲明",
  lawyerNoticeItems: [
    "提供法律意見前，請先確認服務邊界與執業責任。",
    "未完成必要程序前，不得讓使用者誤認已成立正式委任關係。",
    "請依適用規範處理保密義務與個資。",
  ],
  lawyerScopeTitle: "目前已實裝範圍",
  lawyerScopeItems: [
    "帳戶、錢包與律師聲明流程可使用。",
    "需求者端可瀏覽律師資料。",
    "直接通話、錄音保存、分潤與證據鏈管理仍待開發。",
  ],
  profileOnly: "目前僅提供資料瀏覽與說明，尚未開放直接通話。",
  startCall: "開始通話",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

export function LawyerListPage({ locale, viewerRole, onStartCall }: Props) {
  const copy = getCopy(locale);
  if (viewerRole === "lawyer") {
    return <LawyerWorkspace copy={copy} />;
  }
  return <WorkerLawyerDirectory copy={copy} onStartCall={onStartCall} />;
}

function WorkerLawyerDirectory({ copy, onStartCall }: { copy: typeof zh; onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void }) {
  const [lawyers, setLawyers] = useState<LawyerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    async function fetchLawyers() {
      try {
        const lawyerQuery = query(
          collection(db, "lawyer_profiles"),
          where("licenseStatus", "==", "verified"),
          orderBy("ratingAvg", "desc")
        );
        const snapshot = await getDocs(lawyerQuery);

        if (snapshot.empty) {
          setLawyers(DEMO_LAWYERS);
          setIsDemo(true);
        } else {
          setLawyers(snapshot.docs.map((doc) => doc.data() as LawyerProfile));
          setIsDemo(false);
        }
      } catch {
        setLawyers(DEMO_LAWYERS);
        setIsDemo(true);
      } finally {
        setLoading(false);
      }
    }

    fetchLawyers();
  }, []);

  const keyword = searchTerm.trim().toLowerCase();
  const filteredLawyers = lawyers.filter((lawyer) => {
    if (!keyword) {
      return true;
    }

    return (
      lawyer.fullName.toLowerCase().includes(keyword) ||
      lawyer.specialties.some((specialty) => specialty.toLowerCase().includes(keyword)) ||
      lawyer.serviceLanguages.some((language) =>
        (localeNames[language as SupportedLocale] || language).toLowerCase().includes(keyword)
      )
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">{copy.workerTitle}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500">{copy.workerSubtitle}</p>
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={copy.search}
              className="w-full rounded-[1.3rem] border border-slate-200 px-12 py-3 text-sm outline-none transition focus:border-[rgba(184,100,67,0.45)] focus:ring-4 focus:ring-[rgba(184,100,67,0.08)]"
            />
          </div>
          {isDemo ? <p className="mt-4 rounded-[1.2rem] bg-amber-50 px-4 py-3 text-sm text-amber-700">{copy.demo}</p> : null}
        </div>

        <InfoPanel title={copy.workerNoticeTitle} items={copy.workerNoticeItems} />
      </div>

      {filteredLawyers.length === 0 ? (
        <div className="rounded-[1.6rem] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
          {copy.noResult}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredLawyers.map((lawyer) => (
            <LawyerCard key={lawyer.uid} lawyer={lawyer} copy={copy} onStartCall={onStartCall} />
          ))}
        </div>
      )}
    </div>
  );
}

function LawyerWorkspace({ copy }: { copy: typeof zh }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="brand-hero overflow-hidden rounded-[1.8rem] px-6 py-7 text-white">
        <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/78">
          LawBridge
        </span>
        <h2 className="brand-title mt-4 text-3xl font-semibold">{copy.lawyerTitle}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/84">{copy.lawyerSubtitle}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <InfoPanel title={copy.lawyerNoticeTitle} items={copy.lawyerNoticeItems} />
        <InfoPanel title={copy.lawyerScopeTitle} items={copy.lawyerScopeItems} />
      </div>
    </div>
  );
}

function LawyerCard({ lawyer, copy, onStartCall }: { lawyer: LawyerProfile; copy: typeof zh; onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void }) {
  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-slate-900">{lawyer.fullName}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              {copy.verified}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${lawyer.isOnline ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
              {lawyer.isOnline ? copy.available : copy.offline}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{lawyer.licenseNo}</p>
          <p className="mt-4 text-sm leading-7 text-slate-600">{lawyer.bio}</p>
        </div>

        <div className="rounded-[1.4rem] bg-slate-50 px-4 py-3 text-left sm:min-w-[150px]">
          <div className="flex items-center gap-2 text-amber-500">
            <Star className="h-4 w-4 fill-current" />
            <span className="font-semibold text-slate-800">{lawyer.ratingAvg}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{lawyer.ratingCount} {copy.reviews}</p>
          <p className="mt-3 text-sm font-medium text-[var(--brand-accent)]">{lawyer.ratePerMinute} {copy.perMinute}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {lawyer.specialties.map((specialty) => (
          <span key={specialty} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            {specialty}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-2 text-sm text-slate-500">
          <Globe className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex flex-wrap gap-2">
            <span>{copy.languages}:</span>
            {lawyer.serviceLanguages.map((language) => (
              <span key={language} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                {localeNames[language as SupportedLocale] || language}
              </span>
            ))}
          </div>
        </div>

        {lawyer.isOnline && onStartCall ? (
          <button
            type="button"
            onClick={() => onStartCall(lawyer.uid, lawyer.fullName, lawyer.ratePerMinute)}
            className="inline-flex items-center gap-2 rounded-[1.2rem] bg-emerald-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-emerald-700"
          >
            <Phone className="h-4 w-4" />
            {copy.startCall}
          </button>
        ) : (
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
            {lawyer.isOnline ? copy.profileOnly : copy.offline}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoPanel({ title, items }: { title: string; items: string[] }) {
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
