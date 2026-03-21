import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";
import { FieldValue } from "firebase-admin/firestore";

const BASE_RATE_PER_MINUTE = 25;

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const { consultationId, durationSec } = await req.json();

    if (!consultationId || durationSec == null) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const consultRef = adminDb.doc(`consultations/${consultationId}`);
    const consultSnap = await consultRef.get();

    if (!consultSnap.exists) {
      return NextResponse.json(
        { error: "Consultation not found" },
        { status: 404 }
      );
    }

    const data = consultSnap.data()!;
    if (
      data.workerUid !== authUser.uid &&
      data.lawyerUid !== authUser.uid
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (data.status === "completed" || data.status === "cancelled") {
      return NextResponse.json({
        message: "Already finalized",
        chargePoints: data.chargePoints,
      });
    }

    if ((data.status === "requested" || data.status === "matched") && Number(durationSec) <= 0) {
      await consultRef.set(
        {
          status: "cancelled",
          endedAt: new Date().toISOString(),
          chargePoints: 0,
          platformFeePoints: 0,
          lawyerPayoutPoints: 0,
        },
        { merge: true }
      );

      return NextResponse.json({
        success: true,
        cancelled: true,
        durationSec: 0,
        minutes: 0,
        chargePoints: 0,
        platformFeePoints: 0,
        lawyerPayoutPoints: 0,
      });
    }

    const ratePerMinute = Math.max(
      BASE_RATE_PER_MINUTE,
      Number(data.ratePerMinute) || BASE_RATE_PER_MINUTE
    );
    const minutes = Math.max(1, Math.ceil(durationSec / 60));
    const totalCharge = minutes * ratePerMinute;
    const platformFee = Math.ceil(totalCharge * 0.2);
    const lawyerPayout = totalCharge - platformFee;

    const workerUid = data.workerUid;
    const lawyerUid = data.lawyerUid;
    const now = new Date().toISOString();

    let actualCharge = totalCharge;
    let actualPlatformFee = platformFee;
    let actualLawyerPayout = lawyerPayout;

    await adminDb.runTransaction(async (txn) => {
      const workerWalletRef = adminDb.doc(`wallets/${workerUid}`);
      const lawyerWalletRef = adminDb.doc(`wallets/${lawyerUid}`);
      const workerWallet = await txn.get(workerWalletRef);
      const lawyerWallet = await txn.get(lawyerWalletRef);

      const workerBalance = workerWallet.data()?.pointsBalance ?? 0;
      actualCharge = Math.min(totalCharge, workerBalance);
      actualPlatformFee = Math.ceil(actualCharge * 0.2);
      actualLawyerPayout = actualCharge - actualPlatformFee;

      txn.update(workerWalletRef, {
        pointsBalance: FieldValue.increment(-actualCharge),
        updatedAt: now,
      });

      if (lawyerWallet.exists) {
        txn.update(lawyerWalletRef, {
          pointsBalance: FieldValue.increment(actualLawyerPayout),
          pendingPayoutPoints: FieldValue.increment(actualLawyerPayout),
          availablePayoutPoints:
            (lawyerWallet.data()?.availablePayoutPoints ?? 0) + actualLawyerPayout,
          updatedAt: now,
        });
      } else {
        txn.set(lawyerWalletRef, {
          uid: lawyerUid,
          pointsBalance: actualLawyerPayout,
          pendingPayoutPoints: actualLawyerPayout,
          availablePayoutPoints: actualLawyerPayout,
          currency: "TWD",
          updatedAt: now,
        });
      }

      const workerTxnRef = adminDb.collection("wallet_transactions").doc();
      txn.set(workerTxnRef, {
        id: workerTxnRef.id,
        uid: workerUid,
        type: "consult_charge",
        points: -actualCharge,
        amountTwd: actualCharge,
        consultationId,
        status: "settled",
        createdAt: now,
      });

      const lawyerTxnRef = adminDb.collection("wallet_transactions").doc();
      txn.set(lawyerTxnRef, {
        id: lawyerTxnRef.id,
        uid: lawyerUid,
        type: "lawyer_payout",
        points: actualLawyerPayout,
        amountTwd: actualLawyerPayout,
        consultationId,
        status: "settled",
        createdAt: now,
      });

      const platformTxnRef = adminDb.collection("wallet_transactions").doc();
      txn.set(platformTxnRef, {
        id: platformTxnRef.id,
        uid: "platform",
        type: "platform_fee",
        points: actualPlatformFee,
        amountTwd: actualPlatformFee,
        consultationId,
        status: "settled",
        createdAt: now,
      });

      txn.update(consultRef, {
        status: "completed",
        durationSec,
        chargePoints: actualCharge,
        platformFeePoints: actualPlatformFee,
        lawyerPayoutPoints: actualLawyerPayout,
        endedAt: now,
      });
    });

    return NextResponse.json({
      success: true,
      durationSec,
      minutes,
      chargePoints: actualCharge,
      platformFeePoints: actualPlatformFee,
      lawyerPayoutPoints: actualLawyerPayout,
    });
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("End consultation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
