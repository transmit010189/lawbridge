import { NextRequest, NextResponse } from "next/server";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const { uid } = (await req.json()) as { uid?: string };

    if (!uid || uid !== authUser.uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: "DIRECT_TOPUP_DISABLED",
        message:
          "Direct wallet top-up is disabled. Use the NewebPay gateway route instead.",
      },
      { status: 410 }
    );
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("Top-up error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
