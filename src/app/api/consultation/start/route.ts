import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const { workerUid, lawyerUid, ratePerMinute, languageFrom, languageTo } =
      await req.json();

    if (!workerUid || !lawyerUid || !ratePerMinute) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (workerUid !== authUser.uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const walletSnap = await adminDb.doc(`wallets/${workerUid}`).get();
    if (!walletSnap.exists) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const balance = walletSnap.data()?.pointsBalance ?? 0;
    if (balance < ratePerMinute) {
      return NextResponse.json(
        { error: "INSUFFICIENT_BALANCE", balance, required: ratePerMinute },
        { status: 402 }
      );
    }

    const now = new Date().toISOString();
    const consultRef = adminDb.collection("consultations").doc();
    const consultation = {
      id: consultRef.id,
      workerUid,
      lawyerUid,
      status: "requested",
      mode: "audio",
      durationSec: 0,
      chargePoints: 0,
      platformFeePoints: 0,
      lawyerPayoutPoints: 0,
      ratePerMinute,
      languageFrom: languageFrom || "zh-TW",
      languageTo: languageTo || "zh-TW",
      createdAt: now,
    };

    await consultRef.set(consultation);

    return NextResponse.json({ consultationId: consultRef.id, balance });
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
