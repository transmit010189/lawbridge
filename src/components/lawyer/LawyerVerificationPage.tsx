"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, Loader2, ShieldCheck, Video } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import { CertificateUpload } from "./CertificateUpload";
import type { LawyerProfile, SupportedLocale } from "@/types";

interface Props {
  locale: SupportedLocale;
  onBack: () => void;
}

function copy(locale: SupportedLocale) {
  const zh = locale === "zh-TW";
  return {
    title: zh ? "律師驗證中心" : "Lawyer verification center",
    subtitle: zh
      ? "這個頁面專門處理 KYC、帳戶比對與真人複核；完成後工作台只保留驗證結果。"
      : "KYC, payout account matching, and live review stay here. The main workspace only shows the result.",
    back: zh ? "回到律師工作台" : "Back to workspace",
    verified: zh ? "驗證已完成" : "Verification complete",
    verifiedBody: zh
      ? "律師字號與收款帳戶比對已通過，後續工作台只會顯示驗證結果，不再重複要求上傳。"
      : "License and payout-account checks are complete. The desk now shows the final result only.",
    manual: zh ? "需人工或視訊複核" : "Manual or video review required",
    manualBody: zh
      ? "若姓名不一致或文件可信度不足，客服會接手人工審核與真人視訊驗證。"
      : "Support will continue with manual and live verification if a mismatch is detected.",
  };
}

export function LawyerVerificationPage({ locale, onBack }: Props) {
  const { user } = useAuthContext();
  const c = useMemo(() => copy(locale), [locale]);
  const [profile, setProfile] = useState<LawyerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!user?.uid) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const snapshot = await getDoc(doc(db, "lawyer_profiles", user.uid));
      setProfile(snapshot.exists() ? (snapshot.data() as LawyerProfile) : null);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-accent)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_38%),linear-gradient(135deg,#0f172a,#1e293b)] px-6 py-7 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.32em] text-white/60">LawBridge Verify</p>
              <h2 className="mt-3 text-3xl font-semibold">{c.title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/80">{c.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 rounded-[1.2rem] bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
            >
              <ArrowLeft className="h-4 w-4" />
              {c.back}
            </button>
          </div>
        </div>
      </div>

      {profile?.licenseStatus === "verified" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <StatusPanel
            icon={<BadgeCheck className="h-5 w-5 text-emerald-600" />}
            title={c.verified}
            body={c.verifiedBody}
            rows={[
              { label: locale === "zh-TW" ? "律師字號" : "License", value: profile.licenseNo || "—" },
              { label: locale === "zh-TW" ? "驗證姓名" : "Verified name", value: profile.verifiedName || profile.fullName || "—" },
              { label: locale === "zh-TW" ? "銀行尾碼" : "Bank last 4", value: profile.payoutBankLast4 || "—" },
            ]}
          />
          <StatusPanel
            icon={<ShieldCheck className="h-5 w-5 text-sky-600" />}
            title={locale === "zh-TW" ? "工作台現況" : "Workspace status"}
            body={
              locale === "zh-TW"
                ? "主工作台現在只保留可反覆使用的內容，例如上線接聽、費率、收益與 QR 工具。"
                : "The main workspace now stays focused on daily actions such as availability, pricing, earnings, and QR tools."
            }
            rows={[
              { label: locale === "zh-TW" ? "驗證狀態" : "Verification", value: profile.verificationStage || "verified" },
              { label: locale === "zh-TW" ? "收款帳戶" : "Payout account", value: profile.payoutAccountVerified ? "verified" : "pending" },
              { label: locale === "zh-TW" ? "翻譯輔助" : "Translation assist", value: profile.translationAssistEnabled ? "enabled" : "disabled" },
            ]}
          />
        </div>
      ) : (
        <>
          {profile?.verificationStage === "video_review_required" ? (
            <StatusPanel
              icon={<Video className="h-5 w-5 text-amber-600" />}
              title={c.manual}
              body={c.manualBody}
              rows={[
                { label: locale === "zh-TW" ? "目前階段" : "Current stage", value: profile.verificationStage || "manual_review" },
                { label: locale === "zh-TW" ? "律師字號" : "License", value: profile.licenseNo || "—" },
                { label: locale === "zh-TW" ? "驗證姓名" : "Verified name", value: profile.verifiedName || profile.fullName || "—" },
              ]}
            />
          ) : null}

          <CertificateUpload
            locale={locale}
            profile={profile}
            onVerified={(nextProfile) => setProfile(nextProfile)}
          />
        </>
      )}
    </div>
  );
}

function StatusPanel({
  icon,
  title,
  body,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50">
          {icon}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{body}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 rounded-[1.4rem] bg-slate-50 px-4 py-4 text-sm text-slate-600">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4">
            <span>{row.label}</span>
            <span className="text-right font-medium text-slate-900">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
