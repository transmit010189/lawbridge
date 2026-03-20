"use client";

import { useState } from "react";
import { uploadBytesResumable, getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase/client";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { Loader2, UploadCloud, CheckCircle } from "lucide-react";

export function CertificateUpload() {
  const { user } = useAuthContext();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);
    setError("");

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
        }
      );
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      setUploading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">上傳證照與身分證明 (Upload Certificate)</h3>
      <p className="mt-1 text-sm text-slate-500">請上傳您的律師執業證明或身分文件，以供審核。 (Please upload your ID or practicing certificate.)</p>
      
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <input 
          type="file" 
          accept="image/*,.pdf" 
          onChange={(e) => {
             if (e.target.files?.[0]) {
               setFile(e.target.files[0]);
               setDownloadUrl(null);
               setProgress(0);
             }
          }}
          className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
        />
        <button
          onClick={handleUpload}
          disabled={!file || uploading || !!downloadUrl}
          className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {uploading ? "上傳中..." : "開始上傳 Upload"}
        </button>
      </div>

      {uploading && (
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      
      {downloadUrl && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle className="h-4 w-4" />
          上傳成功！檔案審核中。(Successfully uploaded!)
        </div>
      )}
    </div>
  );
}
