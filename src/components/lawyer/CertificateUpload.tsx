"use client";

import { useMemo, useRef, useState } from "react";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import {
  AlertCircle,
  ArrowDownToLine,
  BadgeCheck,
  CheckCircle2,
  Landmark,
  Loader2,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/components/auth/AuthProvider";
import type { LawyerProfile, SupportedLocale } from "@/types";

interface Props {
  locale?: SupportedLocale;
  profile?: LawyerProfile | null;
  onVerified?: (profile: LawyerProfile) => void;
}

type VerificationTone = "idle" | "verifying" | "matched" | "manual_review" | "failed";

const COMPLIANCE_VERSION = "lawyer-kyc-v1";

const NOTICE_ITEMS_ZH = [
  "平台將保存律師執業證明、銀行撥款帳戶資料與 OCR 結果，僅用於 KYC、撥款、客服稽核與爭議處理。",
  "律師應確認上傳資料真實且屬本人所有；若姓名不一致、影像不清或疑似冒用，平台將轉入人工審核與客服視訊驗證。",
  "未完成文件驗證前，律師字號、撥款帳戶與收益提領功能均不得啟用。",
  "錄音、個資與案件資料僅能於合法服務目的內使用，不得擅自保存、外流或作其他用途。",
  "完成閱讀並勾選同意後，才可進入文件上傳與 OCR 比對流程。",
];

const NOTICE_ITEMS_EN = [
  "The platform stores license proof, payout-bank materials, and OCR results only for KYC, payout, audit, and dispute handling.",
  "The uploaded documents must belong to the same lawyer. Name mismatch or suspicious evidence will be escalated to manual review and live video verification.",
  "Before verification is completed, the lawyer license number and payout account cannot be activated.",
  "Call recordings and personal data may only be used for legitimate service operations within platform policy.",
  "You must scroll through the notice and explicitly agree before continuing.",
];

function copy(locale: SupportedLocale) {
  const zh = locale === "zh-TW";
  return {
    title: zh ? "律師 KYC 與撥款帳戶驗證" : "Lawyer KYC & payout verification",
    subtitle: zh
      ? "比照銀行開戶等級的嚴謹流程：先閱讀資料使用聲明，再上傳證照與個人銀行帳戶做 OCR 比對。"
      : "Bank-grade onboarding: review the compliance notice first, then upload your practicing certificate and payout account proof for OCR matching.",
    noticeTitle: zh ? "資料使用與專業義務聲明" : "Data-use and professional notice",
    scrollHint: zh ? "請完整下拉閱讀後，才可勾選下一步。" : "Scroll to the end before enabling the next step.",
    agree: zh ? "我已完整閱讀並同意上述資料使用與驗證流程" : "I have read and agree to the notice above.",
    certificate: zh ? "律師執業證明" : "Practicing certificate",
    certificateHint: zh ? "建議上傳清晰正面照或 PDF。" : "Upload a clear front-facing image or PDF.",
    bank: zh ? "個人撥款帳戶證明" : "Personal payout account proof",
    bankHint: zh ? "可上傳存摺封面、銀行證明或帳戶截圖。" : "Upload a passbook cover, bank proof, or account screenshot.",
    uploadReady: zh ? "已就緒" : "Ready",
    verify: zh ? "開始驗證" : "Start verification",
    verifying: zh ? "驗證中..." : "Verifying...",
    matched: zh ? "文件比對通過，可進入接案與撥款流程。" : "Documents matched. You can proceed to receiving cases and payouts.",
    manual: zh ? "已進入人工複核，客服可能會要求補件。" : "Escalated to manual review. Support may request additional material.",
    failed: zh ? "文件驗證失敗，請重新上傳更清楚或正確的資料。" : "Verification failed. Please upload clearer or valid documents.",
    video: zh ? "姓名或文件可信度不足，已標記需客服視訊真人驗證。" : "Name mismatch or low confidence detected. Live video verification is required.",
    license: zh ? "律師字號將由 OCR 自動帶入，無法手動輸入。" : "The lawyer license number is auto-filled from OCR and cannot be typed manually.",
    payout: zh ? "撥款規則：平台錢包先入帳，完成 KYC 後每週二 / 週五 14:00 對帳，預計 T+2 工作日入帳。" : "Payout rule: earnings land in the platform wallet first. After KYC, settlement runs every Tue/Fri 14:00 and usually arrives in T+2 business days.",
    extracted: zh ? "OCR 摘要" : "OCR summary",
    certificateName: zh ? "證照姓名" : "Certificate name",
    licenseNo: zh ? "律師字號" : "License number",
    bankName: zh ? "帳戶戶名" : "Account holder",
    bankLast4: zh ? "帳戶末四碼" : "Last 4 digits",
    status: zh ? "目前驗證狀態" : "Current verification status",
    stageLabel: zh ? "驗證階段" : "Verification stage",
    needFiles: zh ? "請先上傳證照與銀行帳戶文件。" : "Please upload both certificate and bank account proof.",
  };
}

async function uploadFile(uid: string, file: File, slot: "certificate" | "bank") {
  const storageRef = ref(
    storage,
    `verifications/${uid}/${slot}-${Date.now()}-${file.name}`
  );

  const uploadTask = uploadBytesResumable(storageRef, file);

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      undefined,
      reject,
      () => resolve()
    );
  });

  return getDownloadURL(uploadTask.snapshot.ref);
}

export function CertificateUpload({ locale = "zh-TW", profile, onVerified }: Props) {
  const { user } = useAuthContext();
  const c = useMemo(() => copy(locale), [locale]);
  const noticeItems = locale === "zh-TW" ? NOTICE_ITEMS_ZH : NOTICE_ITEMS_EN;
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const [noticeRead, setNoticeRead] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tone, setTone] = useState<VerificationTone>(
    profile?.licenseStatus === "verified" ? "matched" : "idle"
  );
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    certificateName?: string;
    certificateLicenseNo?: string;
    bankAccountHolderName?: string;
    bankAccountLast4?: string;
    videoReviewRequired?: boolean;
  } | null>(null);

  const handleScroll = () => {
    const element = noticeRef.current;
    if (!element) {
      return;
    }

    const reachedBottom =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
    if (reachedBottom) {
      setNoticeRead(true);
    }
  };

  const startVerification = async () => {
    if (!user) {
      setError(locale === "zh-TW" ? "請先登入。" : "Please sign in first.");
      return;
    }
    if (!certificateFile || !bankFile) {
      setError(c.needFiles);
      return;
    }

    setSubmitting(true);
    setError("");
    setTone("verifying");

    try {
      const [certificateImageUrl, bankImageUrl] = await Promise.all([
        uploadFile(user.uid, certificateFile, "certificate"),
        uploadFile(user.uid, bankFile, "bank"),
      ]);

      const response = await fetch("/api/lawyer/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          certificateImageUrl,
          bankImageUrl,
          displayName: user.displayName,
          ndaAccepted: accepted,
          complianceVersion: COMPLIANCE_VERSION,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      setResult({
        certificateName: data.certificateName,
        certificateLicenseNo: data.certificateLicenseNo,
        bankAccountHolderName: data.bankAccountHolderName,
        bankAccountLast4: data.bankAccountLast4,
        videoReviewRequired: data.videoReviewRequired,
      });

      setTone(data.govCheckResult || "manual_review");
      if (data.profile && onVerified) {
        onVerified(data.profile as LawyerProfile);
      }
    } catch (err) {
      setTone("failed");
      setError(err instanceof Error ? err.message : c.failed);
    } finally {
      setSubmitting(false);
    }
  };

  const stageLabel =
    profile?.verificationStage === "verified"
      ? locale === "zh-TW"
        ? "已完成"
        : "Verified"
      : profile?.verificationStage === "video_review_required"
        ? locale === "zh-TW"
          ? "需視訊複核"
          : "Video review required"
        : profile?.verificationStage === "manual_review"
          ? locale === "zh-TW"
            ? "人工複核中"
            : "Manual review"
          : locale === "zh-TW"
            ? "尚未完成"
            : "Pending";

  return (
    <div className="overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white shadow-sm">
      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.18),_transparent_46%),linear-gradient(135deg,#0f172a,#1f2937)] px-6 py-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-white/60">LawBridge KYC</p>
            <h3 className="mt-3 text-2xl font-semibold">{c.title}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/78">{c.subtitle}</p>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/80">
            {stageLabel}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">{c.noticeTitle}</p>
              <p className="text-xs text-slate-500">{c.scrollHint}</p>
            </div>
          </div>

          <div
            ref={noticeRef}
            onScroll={handleScroll}
            className="mt-4 max-h-52 space-y-3 overflow-y-auto rounded-[1.4rem] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600"
          >
            {noticeItems.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>

          <label className="mt-4 flex items-start gap-3 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={accepted}
              disabled={!noticeRead}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span>{c.agree}</span>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <UploadSlot
            title={c.certificate}
            hint={c.certificateHint}
            disabled={!accepted || submitting}
            file={certificateFile}
            onChange={setCertificateFile}
            icon={<ScanSearch className="h-5 w-5 text-sky-600" />}
          />
          <UploadSlot
            title={c.bank}
            hint={c.bankHint}
            disabled={!accepted || submitting}
            file={bankFile}
            onChange={setBankFile}
            icon={<Landmark className="h-5 w-5 text-amber-600" />}
          />
        </div>

        <div className="rounded-[1.6rem] border border-slate-200 bg-slate-950 px-5 py-5 text-white">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2 text-sm leading-7 text-white/80">
              <p>{c.license}</p>
              <p>{c.payout}</p>
            </div>
            <button
              type="button"
              onClick={startVerification}
              disabled={!accepted || !certificateFile || !bankFile || submitting}
              className={`inline-flex items-center justify-center gap-2 rounded-[1.2rem] px-4 py-3 text-sm font-medium transition ${
                accepted && certificateFile && bankFile && !submitting
                  ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  : "cursor-not-allowed bg-white/10 text-white/45"
              }`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              {submitting ? c.verifying : c.verify}
            </button>
          </div>
        </div>

        {error ? (
          <StatusBanner tone="failed" text={error} />
        ) : tone === "matched" ? (
          <StatusBanner tone="matched" text={c.matched} />
        ) : tone === "manual_review" ? (
          <StatusBanner
            tone="manual_review"
            text={result?.videoReviewRequired ? c.video : c.manual}
          />
        ) : tone === "verifying" ? (
          <StatusBanner tone="verifying" text={c.verifying} />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <MetricCard label={c.stageLabel} value={stageLabel} />
          <MetricCard label={c.status} value={profile?.licenseStatus || "pending"} />
          <MetricCard
            label={c.certificateName}
            value={result?.certificateName || profile?.verifiedName || "—"}
          />
          <MetricCard
            label={c.licenseNo}
            value={result?.certificateLicenseNo || profile?.licenseNo || "—"}
          />
          <MetricCard
            label={c.bankName}
            value={result?.bankAccountHolderName || "—"}
          />
          <MetricCard
            label={c.bankLast4}
            value={result?.bankAccountLast4 || profile?.payoutBankLast4 || "—"}
          />
        </div>
      </div>
    </div>
  );
}

function UploadSlot({
  title,
  hint,
  disabled,
  file,
  onChange,
  icon,
}: {
  title: string;
  hint: string;
  disabled: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
  icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-[1.6rem] border p-5 ${disabled ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>
      </div>
      <input
        type="file"
        accept="image/*,.pdf"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        className="mt-4 block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-60"
      />
      <div className="mt-4 rounded-[1.2rem] bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {file ? (
          <span className="inline-flex items-center gap-2 font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {file.name}
          </span>
        ) : (
          "尚未上傳"
        )}
      </div>
    </div>
  );
}

function StatusBanner({ tone, text }: { tone: VerificationTone; text: string }) {
  const styleMap = {
    verifying: {
      icon: <Loader2 className="h-4 w-4 animate-spin" />,
      className: "border-sky-200 bg-sky-50 text-sky-800",
    },
    matched: {
      icon: <BadgeCheck className="h-4 w-4" />,
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    manual_review: {
      icon: <AlertCircle className="h-4 w-4" />,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    failed: {
      icon: <AlertCircle className="h-4 w-4" />,
      className: "border-rose-200 bg-rose-50 text-rose-800",
    },
    idle: {
      icon: null,
      className: "border-slate-200 bg-slate-50 text-slate-700",
    },
  } as const;

  const style = styleMap[tone];

  return (
    <div className={`flex items-start gap-3 rounded-[1.4rem] border px-4 py-4 text-sm ${style.className}`}>
      {style.icon}
      <p>{text}</p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-3 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
