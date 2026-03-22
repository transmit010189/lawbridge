"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import type { SupportedLocale } from "@/types";

interface PwaInstallButtonProps {
  locale: SupportedLocale;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isIos() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function copy(locale: SupportedLocale) {
  const zh = locale === "zh-TW";

  return {
    install: zh ? "安裝 App" : "Install App",
    openGuide: zh ? "加入桌面" : "Add to Home Screen",
    installed: zh ? "已安裝" : "Installed",
    iosTitle: zh ? "將 LawBridge 加到手機桌面" : "Add LawBridge to your home screen",
    iosBody: zh
      ? "iPhone / iPad 不會顯示系統安裝提示。請用 Safari 右下角分享，再點「加入主畫面」。"
      : "iPhone and iPad do not show the standard install prompt. Use Safari's Share menu, then choose Add to Home Screen.",
    iosSteps: zh
      ? ["點 Safari 下方的分享按鈕", "往下找到「加入主畫面」", "確認名稱後按右上角加入"]
      : [
          "Tap the Share button in Safari",
          "Scroll down and choose Add to Home Screen",
          "Confirm the title and tap Add"
        ],
    close: zh ? "關閉" : "Close",
  };
}

export function PwaInstallButton({ locale }: PwaInstallButtonProps) {
  const c = useMemo(() => copy(locale), [locale]);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowIosGuide(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
        <Smartphone className="h-4 w-4" />
        {c.installed}
      </span>
    );
  }

  const ios = isIos();
  const canRender = Boolean(installPrompt) || ios;

  if (!canRender) {
    return null;
  }

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setInstallPrompt(null);
      }
      return;
    }

    setShowIosGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(20,35,58,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-[rgba(184,100,67,0.38)] hover:bg-slate-50"
      >
        <Download className="h-4 w-4" />
        {installPrompt ? c.install : c.openGuide}
      </button>

      {showIosGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.8rem] border border-white/40 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  PWA
                </p>
                <h2 className="brand-title mt-3 text-2xl text-slate-900">
                  {c.iosTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200"
                aria-label={c.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">{c.iosBody}</p>
            <ol className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
              {c.iosSteps.map((step, index) => (
                <li key={step} className="rounded-[1.1rem] bg-slate-50 px-4 py-3">
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </>
  );
}
