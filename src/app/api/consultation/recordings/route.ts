import { NextRequest, NextResponse } from "next/server";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";
import { adminDb } from "@/lib/firebase/admin";
import type { ConsultationRecording } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const consultationId = req.nextUrl.searchParams.get("consultationId");

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

    const recordingsSnap = await consultRef
      .collection("recordings")
      .orderBy("uploadedAt", "desc")
      .get();

    const recordings = recordingsSnap.docs.map(
      (doc) => doc.data() as ConsultationRecording
    );

    if (recordings.length === 0 && consultation.recordingPath) {
      recordings.push({
        id: "legacy",
        consultationId,
        storagePath: consultation.recordingPath,
        fileName: consultation.recordingPath.split("/").pop() || "recording.webm",
        mimeType: "audio/webm",
        sizeBytes: 0,
        sha256: consultation.recordingHash || "",
        uploadedAt:
          consultation.recordingUpdatedAt ||
          consultation.endedAt ||
          consultation.createdAt,
        uploadedByUid: consultation.workerUid,
        uploadedByRole: "worker",
        durationSec: consultation.durationSec ?? 0,
      });
    }

    return NextResponse.json({ recordings });
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("List recordings error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
