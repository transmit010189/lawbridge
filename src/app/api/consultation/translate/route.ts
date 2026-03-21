import { NextRequest, NextResponse } from "next/server";
import { GEMINI_CHAT_MODEL } from "@/lib/ai/geminiModels";
import { adminDb } from "@/lib/firebase/admin";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";
import type { SupportedLocale } from "@/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_CHAT_MODEL_PATH = GEMINI_CHAT_MODEL.startsWith("models/")
  ? GEMINI_CHAT_MODEL
  : `models/${GEMINI_CHAT_MODEL}`;

const localeLabelMap: Record<SupportedLocale, string> = {
  "zh-TW": "Traditional Chinese (Taiwan)",
  en: "English",
  id: "Bahasa Indonesia",
  vi: "Vietnamese",
  th: "Thai",
};

function toLanguageLabel(locale: string) {
  return localeLabelMap[locale as SupportedLocale] || locale;
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const {
      consultationId,
      text,
      sourceLanguage,
      targetLanguage,
    } = (await req.json()) as {
      consultationId?: string;
      text?: string;
      sourceLanguage?: string;
      targetLanguage?: string;
    };

    if (!consultationId || !text?.trim()) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const consultationSnap = await adminDb.doc(`consultations/${consultationId}`).get();
    if (!consultationSnap.exists) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 });
    }

    const consultation = consultationSnap.data()!;
    if (
      consultation.workerUid !== authUser.uid &&
      consultation.lawyerUid !== authUser.uid
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const normalizedSource = sourceLanguage || consultation.languageFrom || "zh-TW";
    const normalizedTarget = targetLanguage || consultation.languageTo || "zh-TW";

    if (normalizedSource === normalizedTarget) {
      return NextResponse.json({
        translatedText: text.trim(),
        sourceLanguage: normalizedSource,
        targetLanguage: normalizedTarget,
      });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${GEMINI_CHAT_MODEL_PATH}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: [
                    "You are LawBridge's live bilingual legal-call interpreter.",
                    "Translate only. Do not add explanations, warnings, or summary.",
                    "Preserve names, dates, numbers, legal terms, and speaker intent.",
                    "Keep the output concise and natural for spoken conversation.",
                    `Source language: ${toLanguageLabel(normalizedSource)}`,
                    `Target language: ${toLanguageLabel(normalizedTarget)}`,
                    `Text: ${text.trim()}`,
                  ].join("\n"),
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const translatedText =
      payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text.trim();

    return NextResponse.json({
      translatedText,
      sourceLanguage: normalizedSource,
      targetLanguage: normalizedTarget,
    });
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("Translate consultation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
