"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { localeFlags, localeNames, locales } from "@/lib/i18n";
import type { SupportedLocale } from "@/types";

interface LocaleMenuProps {
  value: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
  className?: string;
  align?: "left" | "right";
}

export function LocaleMenu({
  value,
  onChange,
  className = "",
  align = "right",
}: LocaleMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
      >
        <Globe className="h-4 w-4" />
        <span>{localeFlags[value]}</span>
        <span>{localeNames[value]}</span>
        <ChevronDown
          className={`h-4 w-4 transition ${open ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      <div
        className={`absolute top-[calc(100%+0.6rem)] z-30 min-w-[190px] rounded-[1.2rem] border border-slate-200 bg-white/96 p-2 shadow-[0_20px_50px_rgba(15,23,42,0.14)] backdrop-blur transition-all duration-200 ${
          align === "right" ? "right-0" : "left-0"
        } ${open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"}`}
      >
        {locales.map((locale) => {
          const active = locale === value;
          return (
            <button
              key={locale}
              type="button"
              onClick={() => {
                onChange(locale);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition ${
                active
                  ? "bg-[rgba(209,109,71,0.1)] text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span>{localeNames[locale]}</span>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                {localeFlags[locale]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}