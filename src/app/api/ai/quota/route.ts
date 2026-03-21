import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

const FREE_DAILY_QUOTA = 10;
const PRO_DAILY_QUOTA = 100;

// Check and decrement user's daily AI quota
export async function POST(req: NextRequest) {
  try {
    const { uid } = await req.json();
    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const quotaRef = adminDb.doc(`ai_quotas/${uid}_${today}`);

    // Check subscription tier
    const subSnap = await adminDb.doc(`subscriptions/${uid}`).get();
    const sub = subSnap.exists ? subSnap.data() : null;
    const isPro = sub?.plan === "pro" && sub?.status === "active";
    const dailyLimit = isPro ? PRO_DAILY_QUOTA : FREE_DAILY_QUOTA;

    const result = await adminDb.runTransaction(async (txn) => {
      const quotaSnap = await txn.get(quotaRef);

      if (!quotaSnap.exists) {
        // First query today
        txn.set(quotaRef, { uid, date: today, used: 1, limit: dailyLimit });
        return { allowed: true, used: 1, limit: dailyLimit, remaining: dailyLimit - 1 };
      }

      const data = quotaSnap.data()!;
      const used = data.used || 0;

      if (used >= dailyLimit) {
        return { allowed: false, used, limit: dailyLimit, remaining: 0 };
      }

      txn.update(quotaRef, { used: FieldValue.increment(1) });
      return { allowed: true, used: used + 1, limit: dailyLimit, remaining: dailyLimit - used - 1 };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Quota check error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

// GET: Check remaining quota without decrementing
export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const quotaSnap = await adminDb.doc(`ai_quotas/${uid}_${today}`).get();

    const subSnap = await adminDb.doc(`subscriptions/${uid}`).get();
    const sub = subSnap.exists ? subSnap.data() : null;
    const isPro = sub?.plan === "pro" && sub?.status === "active";
    const dailyLimit = isPro ? PRO_DAILY_QUOTA : FREE_DAILY_QUOTA;

    const used = quotaSnap.exists ? (quotaSnap.data()?.used || 0) : 0;

    return NextResponse.json({
      used,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - used),
      plan: isPro ? "pro" : "free",
    });
  } catch (err) {
    console.error("Quota get error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
