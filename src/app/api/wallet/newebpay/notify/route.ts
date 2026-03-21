import { NextResponse } from "next/server";
import {
  readNewebPayCallbackPayload,
  syncNewebPayTransaction,
} from "@/lib/payments/newebpayServer";

export async function POST(req: Request) {
  try {
    const payload = await readNewebPayCallbackPayload(req);
    const result = await syncNewebPayTransaction(payload);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("NewebPay notify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 400 }
    );
  }
}
