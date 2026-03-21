"use client";

import { useState } from "react";
import { uploadBytesResumable, getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { Loader2, UploadCloud, CheckCircle, AlertCircle, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { SupportedLocale } from "@/types";

interface Props {
  locale?: SupportedLocale;
}

export function CertificateUpload({ locale }: Props) {
  const { user } = useAuthContext();
  const t = useTranslation(locale || "zh-TW");
  const [file, setFile] = useState<File | null>(null);
  const [licenseNo, setLicenseNo] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "matched" | "manual_review" | "failed">("idle");
  const [ocrText, setOcrText] = useState("");

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);
    setError("");
    setVerifyStatus("idle");

    try {
      const storageRef = ref(storage, `verifications/${user.uid}/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(p);
        },
        (err) => {
          setError(err.message);
          setUploading(false);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setDownloadUrl(url);
          setUploading(false);

          setVerifyStatus("verifying");
          try {
            const res = await fetch("/api/lawyer/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid: user.uid,
                imageUrl: url,
                licenseNoSubmitted: licenseNo.trim(),
              }),
            });
            const data = await res.json();
            setVerifyStatus(data.govCheckResult || "manual_review");
            setOcrText(data.ocrRawText || "");
          } catch {
            setVerifyStatus("manual_review");
          }
        }
      );
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      setUploading(false);
    }
  };

  const statusIcon = {
    idle: null,
    verifying: <Loader2 className="h-4 w-4 animate-spin text-sky-600" />,
    matched: <CheckCircle className="h-4 w-4 text-emerald-600" />,
    manual_review: <Search className="h-4 w-4 text-amber-600" />,
    failed: <AlertCircle className="h-4 w-4 text-red-500" />,
  };

  const statusText = {
    idle: "",
    verifying: t.certificate.verifying,
    matched: t.certificate.verified,
    manual_review: t.certificate.manualReview,
    failed: t.certificate.failed,
  };

  const statusBg = {
    idle: "",
    verifying: "bg-sky-50 text-sky-700",
    matched: "bg-emerald-50 text-emerald-700",
    manual_review: "bg-amber-50 text-amber-700",
    failed: "bg-red-50 text-red-500",
  };

  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">{t.certificate.title}</h3>
      <p className="mt-1 text-sm text-slate-500">{t.certificate.subtitle}</p>

      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-500">{t.certificate.licenseNo}</label>
        <input
          type="text"
          value={licenseNo}
          onChange={(e) => setLicenseNo(e.target.value)}
          placeholder={t.certificate.placeholder}
          className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[rgba(184,100,67,0.45)]"
        />
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              setFile(e.target.files[0]);
              setDownloadUrl(null);
              setProgress(0);
              setVerifyStatus("idle");
            }
          }}
          className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
        />
        <button
          onClick={handleUpload}
          disabled={!file || uploading || !!downloadUrl}
          className="flex shrink-0 items-center justify-center gap-2 rounded-[1.3rem] bg-[var(--brand-ink)] px-6 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? t.certificate.uploading : t.certificate.upload}
        </button>
      </div>

      {uploading && (
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-[var(--brand-accent)] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      {verifyStatus !== "idle" && (
        <div className={`mt-4 flex items-center gap-2 rounded-[1.2rem] px-4 py-3 text-sm ${statusBg[verifyStatus]}`}>
          {statusIcon[verifyStatus]}
          {statusText[verifyStatus]}
        </div>
      )}

      {ocrText && verifyStatus !== "verifying" && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
            {t.certificate.ocrResult}
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-wrap">{ocrText}</pre>
        </details>
      )}
    </div>
  );
}
