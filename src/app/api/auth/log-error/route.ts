import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    await adminDb.collection("auth_audit_logs").add({
      ...payload,
      createdAt: new Date().toISOString(),
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "",
      userAgent: request.headers.get("user-agent") || "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Auth audit log error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
