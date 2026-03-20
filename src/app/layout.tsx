import type { Metadata } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_TC({
  variable: "--font-lawbridge-sans",
  weight: ["400", "500", "700"],
});

const notoSerif = Noto_Serif_TC({
  variable: "--font-lawbridge-serif",
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "LawBridge | 勞動法 AI 與法律協作平台",
  description:
    "LawBridge 提供勞動法 RAG 問答、律師媒合與錢包機制，支援跨國勞動法規檢索與外部測試部署。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${notoSans.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full text-slate-900">{children}</body>
    </html>
  );
}
