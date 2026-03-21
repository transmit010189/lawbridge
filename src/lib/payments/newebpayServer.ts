import { adminDb } from "@/lib/firebase/admin";
import {
  decryptNewebPayTradeInfo,
  formatPaymentInstructions,
  getNewebPayConfig,
  resolveNewebPayStatus,
  verifyNewebPayTradeSha,
} from "@/lib/payments/newebpay";
import type { PaymentMethod, WalletTransaction } from "@/types";
import { FieldValue } from "firebase-admin/firestore";

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, String(item ?? "")])
  );
}

function inferPaymentCode(result: Record<string, string>) {
  return (
    result.CodeNo ||
    result.VAccount ||
    [result.Barcode_1, result.Barcode_2, result.Barcode_3]
      .filter(Boolean)
      .join(" ")
  );
}

function inferPaymentMethod(
  existing: PaymentMethod | undefined,
  result: Record<string, string>
): PaymentMethod | undefined {
  if (existing) {
    return existing;
  }

  const paymentType = (result.PaymentType || "").toUpperCase();
  if (paymentType.includes("CREDIT")) {
    return "card";
  }

  if (paymentType.includes("CVS")) {
    return "cvs";
  }

  return undefined;
}

export async function readNewebPayCallbackPayload(req: Request) {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const payload = (await req.json()) as Record<string, unknown>;
    return {
      MerchantID: String(payload.MerchantID ?? ""),
      TradeInfo: String(payload.TradeInfo ?? ""),
      TradeSha: String(payload.TradeSha ?? ""),
    };
  }

  const raw = await req.text();
  const params = new URLSearchParams(raw);
  return {
    MerchantID: params.get("MerchantID") || "",
    TradeInfo: params.get("TradeInfo") || "",
    TradeSha: params.get("TradeSha") || "",
  };
}

export async function syncNewebPayTransaction(input: {
  MerchantID: string;
  TradeInfo: string;
  TradeSha: string;
}) {
  const config = getNewebPayConfig();
  if (!config.configured) {
    throw new Error("NEWEBPAY_NOT_CONFIGURED");
  }

  if (!input.TradeInfo || !input.TradeSha) {
    throw new Error("MISSING_TRADE_DATA");
  }

  if (!verifyNewebPayTradeSha(input.TradeInfo, input.TradeSha, config)) {
    throw new Error("INVALID_TRADE_SHA");
  }

  const tradeResult = decryptNewebPayTradeInfo(input.TradeInfo, config);
  const result = asRecord(tradeResult.Result);
  const merchantOrderNo = result.MerchantOrderNo;
  if (!merchantOrderNo) {
    throw new Error("MISSING_MERCHANT_ORDER_NO");
  }

  const txnRef = adminDb.doc(`wallet_transactions/${merchantOrderNo}`);
  const txnSnap = await txnRef.get();
  if (!txnSnap.exists) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  const txnData = txnSnap.data() as WalletTransaction;
  const paymentMethod = inferPaymentMethod(txnData.paymentMethod, result);
  const nextStatus = resolveNewebPayStatus(tradeResult);
  const now = new Date().toISOString();
  const paymentCode = inferPaymentCode(result);
  const paymentInstructions = formatPaymentInstructions(paymentMethod, result);
  const paymentExpiresAt =
    result.ExpireDate ||
    result.ExpireTime ||
    result.PayTime ||
    undefined;

  const commonUpdate = {
    gateway: "newebpay",
    status: nextStatus,
    paymentMethod,
    paymentCode: paymentCode || null,
    paymentInstructions: paymentInstructions || null,
    paymentExpiresAt: paymentExpiresAt || null,
    gatewayTradeNo: result.TradeNo || null,
    gatewayMessage: tradeResult.Message || null,
    updatedAt: now,
    gatewayPayload: result,
  };

  if (nextStatus !== "settled" || txnData.status === "settled") {
    await txnRef.set(commonUpdate, { merge: true });
    return {
      status: nextStatus,
      merchantOrderNo,
      transactionId: txnRef.id,
      amount: txnData.amountTwd,
    };
  }

  await adminDb.runTransaction(async (txn) => {
    const latestTxnSnap = await txn.get(txnRef);
    const latestTxn = latestTxnSnap.data() as WalletTransaction | undefined;
    if (!latestTxn) {
      throw new Error("TRANSACTION_NOT_FOUND");
    }

    if (latestTxn.status === "settled") {
      txn.set(txnRef, commonUpdate, { merge: true });
      return;
    }

    const walletRef = adminDb.doc(`wallets/${latestTxn.uid}`);
    const walletSnap = await txn.get(walletRef);
    const pointsToCredit = latestTxn.points || latestTxn.amountTwd;

    if (walletSnap.exists) {
      txn.update(walletRef, {
        pointsBalance: FieldValue.increment(pointsToCredit),
        updatedAt: now,
      });
    } else {
      txn.set(walletRef, {
        uid: latestTxn.uid,
        pointsBalance: pointsToCredit,
        currency: "TWD",
        updatedAt: now,
      });
    }

    txn.set(
      txnRef,
      {
        ...commonUpdate,
        settledAt: now,
      },
      { merge: true }
    );
  });

  return {
    status: "settled",
    merchantOrderNo,
    transactionId: txnRef.id,
    amount: txnData.amountTwd,
  };
}
