import { NextRequest, NextResponse } from "next/server";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import { getStorage } from "firebase-admin/storage";

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const consultationId = req.nextUrl.searchParams.get("consultationId");
    const recordingId = req.nextUrl.searchParams.get("recordingId");
    const download = req.nextUrl.searchParams.get("download") === "1";

    if (!consultationId) {
      return NextResponse.json({ error: "Missing consultationId" }, { status: 400 });
    }

    const consultRef = adminDb.doc(`consultations/${consultationId}`);
    const consultSnap = await consultRef.get();
    if (!consultSnap.exists) {
      return NextResponse.json({ error: "Consultation not found" }, { status: 404 });
    }

    const consultation = consultSnap.data()!;
    if (
      consultation.workerUid !== authUser.uid &&
      consultation.lawyerUid !== authUser.uid
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    let storagePath = consultation.recordingPath as string | undefined;
    let fileName = storagePath?.split("/").pop() || "recording.webm";

    if (recordingId && recordingId !== "legacy") {
      const recordingSnap = await consultRef.collection("recordings").doc(recordingId).get();
      if (!recordingSnap.exists) {
        return NextResponse.json({ error: "Recording not found" }, { status: 404 });
      }

      const recording = recordingSnap.data()!;
      storagePath = recording.storagePath;
      fileName = recording.fileName || fileName;
    }

    if (!storagePath) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
    const [signedUrl] = await getStorage().bucket().file(storagePath).getSignedUrl({
      action: "read",
      expires: expiresAt,
      responseDisposition: download
        ? `attachment; filename="${fileName}"`
        : `inline; filename="${fileName}"`,
    });

    return NextResponse.json({
      signedUrl,
      expiresAt: new Date(expiresAt).toISOString(),
      fileName,
    });
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("Get recording access error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
