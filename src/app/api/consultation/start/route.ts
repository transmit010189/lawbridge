import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";

const BASE_RATE_PER_MINUTE = 25;

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const { workerUid, lawyerUid, ratePerMinute } =
      await req.json();

    if (!workerUid || !lawyerUid || !ratePerMinute) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const normalizedRate = Math.max(
      BASE_RATE_PER_MINUTE,
      Number(ratePerMinute) || BASE_RATE_PER_MINUTE
    );

    if (workerUid !== authUser.uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const walletSnap = await adminDb.doc(`wallets/${workerUid}`).get();
    if (!walletSnap.exists) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const balance = walletSnap.data()?.pointsBalance ?? 0;
    if (balance < normalizedRate) {
      return NextResponse.json(
        { error: "INSUFFICIENT_BALANCE", balance, required: normalizedRate },
        { status: 402 }
      );
    }

    const workerSnap = await adminDb.doc(`users/${workerUid}`).get();
    const worker = workerSnap.data();
    const workerLanguage = (worker?.language as string | undefined) || "zh-TW";
    const workerNationality = (worker?.nationality as string | undefined) || "";
    const workerDisplayName =
      (worker?.displayName as string | undefined) || authUser.email || "Worker";
    const translationMode =
      workerLanguage !== "zh-TW" ? "subtitle_assist" : "none";

    const now = new Date().toISOString();
    const consultRef = adminDb.collection("consultations").doc();
    const consultation = {
      id: consultRef.id,
      workerUid,
      lawyerUid,
      workerDisplayName,
      workerLanguage,
      workerNationality,
      status: "requested",
      mode: "audio",
      durationSec: 0,
      chargePoints: 0,
      platformFeePoints: 0,
      lawyerPayoutPoints: 0,
      ratePerMinute: normalizedRate,
      languageFrom: workerLanguage,
      languageTo: "zh-TW",
      translationMode,
      createdAt: now,
    };

    await consultRef.set(consultation);

    return NextResponse.json({
      consultationId: consultRef.id,
      balance,
      workerDisplayName,
      workerLanguage,
      workerNationality,
      translationMode,
      ratePerMinute: normalizedRate,
    });
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("Start consultation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
