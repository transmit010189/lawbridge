import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { GEMINI_VISION_MODEL } from "@/lib/ai/geminiModels";
import type { LawyerProfile } from "@/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PAYOUT_SCHEDULE_NOTE = "完成 KYC 後，每週二 / 週五 14:00 對帳，預計 T+2 個工作日撥款。";
const PAYOUT_ETA_NOTE = "平台收益先入帳 LawBridge 錢包，銀行撥款完成後會更新狀態。";
const BASE_RATE_PER_MINUTE = 25;

interface VisionResult {
  rawText: string;
  parsed: Record<string, unknown> | null;
}

function extractJsonObject(input: string) {
  const match = input.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[．。·・,，.]/g, "")
    .toLowerCase();
}

function namesMatch(left?: string, right?: string) {
  if (!left || !right) {
    return false;
  }

  const a = normalizeName(left);
  const b = normalizeName(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

async function fetchRemoteFile(fileUrl: string) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch uploaded file: ${response.status}`);
  }

  const mimeType =
    response.headers.get("content-type")?.split(";")[0].trim() ||
    "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    mimeType,
    data: buffer.toString("base64"),
  };
}

async function runVision(prompt: string, fileUrl: string): Promise<VisionResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const file = await fetchRemoteFile(fileUrl);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.mimeType,
                  data: file.data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Vision API error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const rawText =
    payload.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("\n")
      .trim() || "";

  return {
    rawText,
    parsed: extractJsonObject(rawText),
  };
}

function readString(parsed: Record<string, unknown> | null, key: string) {
  const value = parsed?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(parsed: Record<string, unknown> | null, key: string) {
  const value = parsed?.[key];
  return typeof value === "boolean" ? value : false;
}

function nextLicenseStatus(
  result: "matched" | "manual_review" | "failed",
  videoReviewRequired: boolean
) {
  if (result === "matched" && !videoReviewRequired) {
    return "verified";
  }

  if (result === "failed") {
    return "rejected";
  }

  return "pending";
}

export async function POST(req: NextRequest) {
  try {
    const {
      uid,
      certificateImageUrl,
      bankImageUrl,
      licenseNoSubmitted,
      displayName,
      ndaAccepted,
      complianceVersion,
    } = await req.json();

    if (!uid || !certificateImageUrl || !bankImageUrl) {
      return NextResponse.json(
        { error: "Missing uid, certificateImageUrl or bankImageUrl" },
        { status: 400 }
      );
    }

    const certificatePrompt = [
      "你正在協助律師平台做 KYC。",
      "這是一張台灣律師執業證書、律師證或官方執業證明。",
      "請提取可見文字，並用 JSON 回覆：",
      '{"ocrText":"","name":"","licenseNo":"","isValid":true,"confidence":"high|medium|low","reason":""}',
    ].join("\n");

    const bankPrompt = [
      "你正在協助律師平台做銀行撥款帳戶 KYC。",
      "這是一張存摺封面、銀行帳戶證明或帳戶截圖。",
      "請提取可見文字，並用 JSON 回覆：",
      '{"ocrText":"","accountHolderName":"","bankName":"","last4":"","confidence":"high|medium|low","reason":""}',
    ].join("\n");

    const [certificateResult, bankResult] = await Promise.all([
      runVision(certificatePrompt, certificateImageUrl),
      runVision(bankPrompt, bankImageUrl),
    ]);

    const certificateName =
      readString(certificateResult.parsed, "name") || displayName || "";
    const certificateLicenseNo =
      readString(certificateResult.parsed, "licenseNo") || licenseNoSubmitted || "";
    const certificateValid = readBoolean(certificateResult.parsed, "isValid");
    const certificateConfidence =
      readString(certificateResult.parsed, "confidence") || "medium";

    const bankAccountHolderName =
      readString(bankResult.parsed, "accountHolderName") || "";
    const bankAccountLast4 = readString(bankResult.parsed, "last4");
    const bankConfidence = readString(bankResult.parsed, "confidence") || "medium";

    const matchedNames = namesMatch(certificateName, bankAccountHolderName);
    const videoReviewRequired =
      !matchedNames ||
      certificateConfidence !== "high" ||
      bankConfidence === "low" ||
      !certificateValid;

    let govCheckResult: "matched" | "manual_review" | "failed" = "manual_review";

    if (!certificateValid || !certificateLicenseNo) {
      govCheckResult = "failed";
    } else if (matchedNames && certificateConfidence === "high") {
      govCheckResult = "matched";
    }

    const now = new Date().toISOString();
    const verificationRef = adminDb.collection("lawyer_verifications").doc();
    await verificationRef.set({
      uid,
      certificateImagePath: certificateImageUrl,
      certificateOcrText: certificateResult.rawText,
      certificateName,
      certificateLicenseNo,
      bankImagePath: bankImageUrl,
      bankOcrText: bankResult.rawText,
      bankAccountHolderName,
      bankAccountLast4,
      nameMatches: matchedNames,
      licenseNoSubmitted: licenseNoSubmitted || "",
      govCheckResult,
      ndaAccepted: Boolean(ndaAccepted),
      complianceAcceptedAt: ndaAccepted ? now : undefined,
      complianceVersion: complianceVersion || "lawyer-kyc-v1",
      videoReviewRequired,
      createdAt: now,
      completedAt: now,
    });

    const profileRef = adminDb.doc(`lawyer_profiles/${uid}`);
    const profileSnap = await profileRef.get();
    const existing = profileSnap.exists ? (profileSnap.data() as LawyerProfile) : null;

    const nextProfile: LawyerProfile = {
      uid,
      fullName: certificateName || existing?.fullName || displayName || "",
      licenseNo: certificateLicenseNo || existing?.licenseNo || "",
      licenseStatus: nextLicenseStatus(govCheckResult, videoReviewRequired),
      verificationStage:
        govCheckResult === "matched" && !videoReviewRequired
          ? "verified"
          : videoReviewRequired
            ? "video_review_required"
            : "manual_review",
      verificationId: verificationRef.id,
      verifiedName: certificateName || existing?.verifiedName || "",
      payoutBankLast4: bankAccountLast4 || existing?.payoutBankLast4,
      payoutAccountVerified: matchedNames,
      payoutScheduleNote: PAYOUT_SCHEDULE_NOTE,
      payoutEtaNote: PAYOUT_ETA_NOTE,
      complianceAcceptedAt: ndaAccepted ? now : existing?.complianceAcceptedAt,
      complianceVersion: complianceVersion || "lawyer-kyc-v1",
      translationAssistEnabled: true,
      specialties: existing?.specialties || ["勞動契約", "外籍勞工", "申訴與調解"],
      serviceLanguages: existing?.serviceLanguages || ["zh-TW"],
      ratingAvg: existing?.ratingAvg || 0,
      ratingCount: existing?.ratingCount || 0,
      bio:
        existing?.bio ||
        "已完成文件驗證，可提供勞動爭議、外籍勞工與申訴程序相關協助。",
      ratePerMinute: Math.max(BASE_RATE_PER_MINUTE, existing?.ratePerMinute || BASE_RATE_PER_MINUTE),
      isOnline: existing?.isOnline || false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await profileRef.set(nextProfile, { merge: true });

    return NextResponse.json({
      verificationId: verificationRef.id,
      govCheckResult,
      videoReviewRequired,
      certificateName,
      certificateLicenseNo,
      bankAccountHolderName,
      bankAccountLast4,
      namesMatch: matchedNames,
      certificateOcrText: certificateResult.rawText.slice(0, 1200),
      bankOcrText: bankResult.rawText.slice(0, 1200),
      profile: nextProfile,
    });
  } catch (err) {
    console.error("Verify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
