import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  void req;
  return NextResponse.json(
    {
      error: "PAYMENT_PROVIDER_DEPRECATED",
      message: "ECPay is deprecated. Use /api/wallet/newebpay instead.",
    },
    { status: 410 }
  );
}
