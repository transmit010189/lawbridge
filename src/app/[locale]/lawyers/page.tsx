"use client";

import { useAuthContext } from "@/components/auth/AuthProvider";
import { CertificateUpload } from "@/components/lawyer/CertificateUpload";
import { QRCodeScanner } from "@/components/lawyer/QRCodeScanner";
import { ShieldAlert } from "lucide-react";

export default function LawyerDashboard() {
  const { user, loading } = useAuthContext();

  if (loading) return <div className="flex h-[50vh] items-center justify-center p-8">Loading...</div>;
  
  if (!user || user.role !== "lawyer") {
    return (
      <div className="mx-auto mt-12 flex max-w-md flex-col items-center rounded-2xl bg-red-50 p-8 text-center text-red-600">
        <ShieldAlert className="mb-4 h-12 w-12" />
        <h2 className="text-xl font-bold">權限不足 (Access Denied)</h2>
        <p className="mt-2 text-sm">此頁面僅供註冊為「律師」的使用者存取。 (This page is restricted to registered lawyers only.)</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold text-slate-900 border-b border-slate-200 pb-4">
        律師工作臺 (Lawyer Workspace)
      </h1>
      <p className="mt-6 text-slate-600">
        歡迎回來，<strong className="text-slate-900">{user.displayName}</strong> 律師。這裡提供您的專屬驗證工具與掃描功能。
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <CertificateUpload />
        <QRCodeScanner />
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
         <h2 className="text-xl font-semibold text-slate-900">案件與統計總覽 (Case Overview)</h2>
         <div className="mt-4 flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
           尚無進行中的委託案件。 (No active cases currently.)
         </div>
      </div>
    </div>
  );
}
