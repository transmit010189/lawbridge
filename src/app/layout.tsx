import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_TC({
  variable: "--font-lawbridge-sans",
  weight: ["400", "500", "700"],
  preload: false,
});

const notoSerif = Noto_Serif_TC({
  variable: "--font-lawbridge-serif",
  weight: ["500", "700"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lawbridge-web--lawbridge-tw.asia-east1.hosted.app"),
  applicationName: "LawBridge",
  title: "LawBridge | RAG 法規問答與移工法律協助",
  description:
    "LawBridge 提供法規 RAG 問答、律師配對、錢包與語音諮詢，現在可直接安裝到手機桌面，以 PWA 方式快速回訪。",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LawBridge",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#14233a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
