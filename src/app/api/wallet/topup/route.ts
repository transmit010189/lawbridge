import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { uid, amount } = await req.json();

    if (!uid || !amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const walletRef = adminDb.doc(`wallets/${uid}`);
    const now = new Date().toISOString();

    await adminDb.runTransaction(async (txn) => {
      const walletSnap = await txn.get(walletRef);

      if (walletSnap.exists) {
        txn.update(walletRef, {
          pointsBalance: FieldValue.increment(amount),
          updatedAt: now,
        });
      } else {
        txn.set(walletRef, {
          uid,
          pointsBalance: amount,
          currency: "TWD",
          updatedAt: now,
        });
      }

      const txnRef = adminDb.collection("wallet_transactions").doc();
      txn.set(txnRef, {
        id: txnRef.id,
        uid,
        type: "topup",
        points: amount,
        amountTwd: amount,
        status: "settled",
        createdAt: now,
      });
    });

    const updatedWallet = await walletRef.get();
    const newBalance = updatedWallet.data()?.pointsBalance ?? 0;

    return NextResponse.json({ success: true, newBalance });
  } catch (err) {
    console.error("Top-up error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
