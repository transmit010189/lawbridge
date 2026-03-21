import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";
import {
  buildNewebPayOrderPayload,
  createMerchantOrderNo,
  getNewebPayConfig,
} from "@/lib/payments/newebpay";
import type { PaymentMethod } from "@/types";

const ALLOWED_AMOUNTS = new Set([100, 300, 500, 1000]);

export async function GET() {
  const config = getNewebPayConfig();
  return NextResponse.json({
    provider: "newebpay",
    configured: config.configured,
    mode: config.mode,
    supportedMethods: ["card", "cvs"],
  });
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const { uid, amount, paymentMethod } = (await req.json()) as {
      uid?: string;
      amount?: number;
      paymentMethod?: PaymentMethod;
    };

    if (!uid || uid !== authUser.uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (!amount || !ALLOWED_AMOUNTS.has(amount)) {
      return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });
    }

    if (paymentMethod !== "card" && paymentMethod !== "cvs") {
      return NextResponse.json(
        { error: "INVALID_PAYMENT_METHOD" },
        { status: 400 }
      );
    }

    const config = getNewebPayConfig();
    if (!config.configured) {
      return NextResponse.json(
        {
          error: "NEWEBPAY_NOT_CONFIGURED",
          message: "NewebPay merchant credentials are not configured yet.",
        },
        { status: 503 }
      );
    }

    const merchantOrderNo = createMerchantOrderNo();
    const now = new Date().toISOString();
    const userSnap = await adminDb.doc(`users/${authUser.uid}`).get();
    const email =
      (userSnap.data()?.email as string | undefined) || authUser.email || "";

    await adminDb.doc(`wallet_transactions/${merchantOrderNo}`).set({
      id: merchantOrderNo,
      uid: authUser.uid,
      type: "topup",
      points: amount,
      amountTwd: amount,
      status: "pending",
      paymentRef: merchantOrderNo,
      gateway: "newebpay",
      paymentMethod,
      createdAt: now,
      updatedAt: now,
    });

    const order = buildNewebPayOrderPayload({
      merchantOrderNo,
      amount,
      itemDesc: `LawBridge ${amount} points`,
      email,
      paymentMethod,
      config,
    });

    return NextResponse.json({
      gatewayUrl: config.gatewayUrl,
      merchantId: order.merchantId,
      tradeInfo: order.tradeInfo,
      tradeSha: order.tradeSha,
      version: order.version,
      merchantOrderNo,
      transactionId: merchantOrderNo,
    });
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("NewebPay create order error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
