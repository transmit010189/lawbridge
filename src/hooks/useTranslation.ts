import en from "@/messages/en.json";
import zhTW from "@/messages/zh-TW.json";
import type { SupportedLocale } from "@/types";

export type Messages = typeof en;

const allMessages: Record<string, Messages> = {
  en,
  "zh-TW": zhTW,
};

/**
 * Returns the full messages object for a given locale.
 * Falls back to English if the locale is not found.
 */
export function useTranslation(locale: SupportedLocale): Messages {
  return allMessages[locale] || allMessages["en"];
}

/**
 * Non-hook version for use outside React components.
 */
export function getMessages(locale: SupportedLocale): Messages {
  return allMessages[locale] || allMessages["en"];
}

/**
 * Simple string interpolation: replaces {key} placeholders with values.
 * Example: interpolate("Need {required} pts", { required: 100 }) => "Need 100 pts"
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}
