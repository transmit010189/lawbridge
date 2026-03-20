import type { SupportedLocale } from "@/types";

export const locales: SupportedLocale[] = ["zh-TW", "en", "id", "vi", "th"];
export const defaultLocale: SupportedLocale = "zh-TW";

export const localeNames: Record<SupportedLocale, string> = {
  "zh-TW": "繁體中文",
  en: "English",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
  th: "ภาษาไทย",
};

export const localeFlags: Record<SupportedLocale, string> = {
  "zh-TW": "繁中",
  en: "EN",
  id: "ID",
  vi: "VI",
  th: "TH",
};