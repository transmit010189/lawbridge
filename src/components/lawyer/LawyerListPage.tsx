"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where, doc, setDoc, updateDoc } from "firebase/firestore";
import { BadgeCheck, Globe, Loader2, Phone, Search, Star, Wifi, WifiOff } from "lucide-react";
import { SkeletonList } from "@/components/Skeleton";
import { db } from "@/lib/firebase/client";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { localeNames } from "@/lib/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import { CertificateUpload } from "./CertificateUpload";
import { QRCodeScanner } from "./QRCodeScanner";
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

export function LawyerListPage({ locale, viewerRole, onStartCall }: Props) {
  if (viewerRole === "lawyer") {
    return <LawyerWorkspace locale={locale} />;
  }
  return <WorkerLawyerDirectory locale={locale} onStartCall={onStartCall} />;
}

function WorkerLawyerDirectory({ locale, onStartCall }: { locale: SupportedLocale; onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void }) {
  const t = useTranslation(locale);
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
          setLawyers(snapshot.docs.map((d) => d.data() as LawyerProfile));
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
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="animate-pulse rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-6 w-40 rounded-lg bg-slate-100" />
          <div className="mt-3 h-4 w-64 rounded-lg bg-slate-100" />
          <div className="mt-5 h-11 w-full rounded-[1.3rem] bg-slate-100" />
        </div>
        <SkeletonList count={4} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">{t.lawyerList.workerTitle}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500">{t.lawyerList.workerSubtitle}</p>
          <div className="relative mt-5">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t.lawyerList.search}
              className="w-full rounded-[1.3rem] border border-slate-200 px-12 py-3 text-sm outline-none transition focus:border-[rgba(184,100,67,0.45)] focus:ring-4 focus:ring-[rgba(184,100,67,0.08)]"
            />
          </div>
          {isDemo ? <p className="mt-4 rounded-[1.2rem] bg-amber-50 px-4 py-3 text-sm text-amber-700">{t.lawyerList.demo}</p> : null}
        </div>

        <InfoPanel title={t.lawyerList.workerNoticeTitle} items={t.lawyerList.workerNoticeItems} />
      </div>

      {filteredLawyers.length === 0 ? (
        <div className="rounded-[1.6rem] border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
          {t.lawyerList.noResult}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredLawyers.map((lawyer) => (
            <LawyerCard key={lawyer.uid} lawyer={lawyer} locale={locale} onStartCall={onStartCall} />
          ))}
        </div>
      )}
    </div>
  );
}

function LawyerWorkspace({ locale }: { locale: SupportedLocale }) {
  const { user } = useAuthContext();
  const t = useTranslation(locale);
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const [formName, setFormName] = useState("");
  const [formLicense, setFormLicense] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formSpecialties, setFormSpecialties] = useState("");
  const [formRate, setFormRate] = useState(10);
  const [formLanguages, setFormLanguages] = useState<SupportedLocale[]>(["zh-TW"]);

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;
      try {
        const profileQuery = query(
          collection(db, "lawyer_profiles"),
          where("uid", "==", user.uid)
        );
        const snap = await getDocs(profileQuery);
        if (!snap.empty) {
          const data = snap.docs[0].data() as LawyerProfile;
          setProfile(data);
          setIsOnline(data.isOnline);
          setFormName(data.fullName);
          setFormLicense(data.licenseNo);
          setFormBio(data.bio);
          setFormSpecialties(data.specialties.join(", "));
          setFormRate(data.ratePerMinute);
          setFormLanguages(data.serviceLanguages);
        } else {
          setFormName(user.displayName || "");
          setEditing(true);
        }
      } catch (err) {
        console.error("Fetch lawyer profile error:", err);
      } finally {
        setLoadingProfile(false);
      }
    }
    fetchProfile();
  }, [user]);

  const toggleOnline = async () => {
    if (!user || !profile) return;
    setToggling(true);
    const newStatus = !isOnline;
    try {
      await updateDoc(doc(db, "lawyer_profiles", user.uid), { isOnline: newStatus, updatedAt: new Date().toISOString() });
      setIsOnline(newStatus);
      setProfile((p) => p ? { ...p, isOnline: newStatus } : p);
    } catch (err) {
      console.error("Toggle online error:", err);
    } finally {
      setToggling(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const profileData: LawyerProfile = {
      uid: user.uid,
      fullName: formName.trim(),
      licenseNo: formLicense.trim(),
      licenseStatus: profile?.licenseStatus || "pending",
      specialties: formSpecialties.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      serviceLanguages: formLanguages,
      ratingAvg: profile?.ratingAvg || 0,
      ratingCount: profile?.ratingCount || 0,
      bio: formBio.trim(),
      ratePerMinute: formRate,
      isOnline: isOnline,
      createdAt: profile?.createdAt || now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, "lawyer_profiles", user.uid), profileData);
      setProfile(profileData);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Save profile error:", err);
    }
  };

  const allLanguages: SupportedLocale[] = ["zh-TW", "en", "id", "vi", "th"];

  if (loadingProfile) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="brand-hero overflow-hidden rounded-[1.8rem] px-6 py-7 text-white">
        <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.32em] text-white/78">
          LawBridge
        </span>
        <h2 className="brand-title mt-4 text-3xl font-semibold">{t.lawyerList.lawyerTitle}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/84">{t.lawyerList.lawyerSubtitle}</p>
      </div>

      {/* Online/Offline Toggle */}
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {isOnline ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <Wifi className="h-6 w-6 text-emerald-600" />
              </div>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <WifiOff className="h-6 w-6 text-slate-400" />
              </div>
            )}
            <div>
              <p className="font-semibold text-slate-900">{isOnline ? t.lawyerList.goOnline : t.lawyerList.goOffline}</p>
              <p className="text-sm text-slate-500">{isOnline ? t.lawyerList.onlineStatus : t.lawyerList.offlineStatus}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleOnline}
            disabled={toggling || !profile}
            className={`rounded-[1.3rem] px-6 py-3 text-sm font-medium transition ${
              isOnline
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            } disabled:opacity-50`}
          >
            {toggling ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
            {isOnline ? t.lawyerList.goOffline : t.lawyerList.goOnline}
          </button>
        </div>
      </div>

      {/* Profile Editor */}
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-400">{t.lawyerList.lawyerProfile}</p>
          {profile && !editing ? (
            <button type="button" onClick={() => setEditing(true)} className="text-sm text-[var(--brand-accent)] hover:underline">{t.lawyerList.editProfile}</button>
          ) : null}
        </div>

        {!profile && !editing ? (
          <p className="mt-4 text-sm text-slate-500">{t.lawyerList.noProfile}</p>
        ) : null}

        {editing ? (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500">{t.lawyerList.fullName}</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[rgba(184,100,67,0.45)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">{t.lawyerList.licenseNo}</label>
              <input type="text" value={formLicense} onChange={(e) => setFormLicense(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[rgba(184,100,67,0.45)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">{t.lawyerList.bio}</label>
              <textarea value={formBio} onChange={(e) => setFormBio(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[rgba(184,100,67,0.45)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">{t.lawyerList.specialties}</label>
              <input type="text" value={formSpecialties} onChange={(e) => setFormSpecialties(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[rgba(184,100,67,0.45)]" placeholder={t.lawyerList.specialtiesPlaceholder} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">{t.lawyerList.ratePerMinute}</label>
              <input type="number" min={1} max={100} value={formRate} onChange={(e) => setFormRate(Number(e.target.value))} className="mt-1 w-32 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[rgba(184,100,67,0.45)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">{t.lawyerList.serviceLanguages}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {allLanguages.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setFormLanguages((prev) => prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang])}
                    className={`rounded-full px-3 py-1.5 text-xs transition ${formLanguages.includes(lang) ? "bg-[var(--brand-ink)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {localeNames[lang] || lang}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSaveProfile} className="rounded-[1.3rem] bg-[var(--brand-ink)] px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800">
                {profile ? t.lawyerList.saveProfile : t.lawyerList.createProfile}
              </button>
              {profile ? (
                <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate-500 hover:text-slate-700">
                  {t.common.cancel}
                </button>
              ) : null}
            </div>
          </div>
        ) : profile ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <p className="text-xl font-semibold text-slate-900">{profile.fullName}</p>
              {profile.licenseStatus === "verified" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />{t.lawyerList.verified}</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">{t.lawyerList.pending}</span>
              )}
            </div>
            <p className="text-sm text-slate-400">{profile.licenseNo}</p>
            <p className="text-sm leading-7 text-slate-600">{profile.bio}</p>
            <div className="flex flex-wrap gap-2">
              {profile.specialties.map((s) => <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{s}</span>)}
            </div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">{profile.ratePerMinute} {t.lawyerList.perMinute}</p>
          </div>
        ) : null}

        {saved ? (
          <div className="mt-4 rounded-[1.2rem] bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{t.lawyerList.profileSaved}</div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <InfoPanel title={t.lawyerList.lawyerNoticeTitle} items={t.lawyerList.lawyerNoticeItems} />
        <InfoPanel title={t.lawyerList.lawyerScopeTitle} items={t.lawyerList.lawyerScopeItems} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <CertificateUpload locale={locale} />
        <QRCodeScanner />
      </div>
    </div>
  );
}

function LawyerCard({ lawyer, locale, onStartCall }: { lawyer: LawyerProfile; locale: SupportedLocale; onStartCall?: (lawyerUid: string, lawyerName: string, rate: number) => void }) {
  const t = useTranslation(locale);
  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-slate-900">{lawyer.fullName}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              <BadgeCheck className="h-3.5 w-3.5" />
              {t.lawyerList.verified}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${lawyer.isOnline ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
              {lawyer.isOnline ? t.lawyerList.available : t.lawyerList.offline}
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
          <p className="mt-1 text-xs text-slate-500">{lawyer.ratingCount} {t.lawyerList.reviews}</p>
          <p className="mt-3 text-sm font-medium text-[var(--brand-accent)]">{lawyer.ratePerMinute} {t.lawyerList.perMinute}</p>
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
            <span>{t.lawyerList.languages}:</span>
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
            {t.lawyerList.startCall}
          </button>
        ) : (
          <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
            {lawyer.isOnline ? t.lawyerList.profileOnly : t.lawyerList.offline}
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
