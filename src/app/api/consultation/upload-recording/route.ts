import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import {
  RequestAuthError,
  requireAuthenticatedUser,
} from "@/lib/auth/requireUser";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

const MAX_RECORDING_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/mp4",
]);

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    const formData = await req.formData();
    const consultationId = formData.get("consultationId") as string;
    const audioFile = formData.get("audio") as File | null;

    if (!consultationId || !audioFile) {
      return NextResponse.json(
        { error: "Missing consultationId or audio" },
        { status: 400 }
      );
    }

    if (audioFile.size === 0 || audioFile.size > MAX_RECORDING_SIZE_BYTES) {
      return NextResponse.json({ error: "INVALID_AUDIO_SIZE" }, { status: 400 });
    }

    const mimeType = audioFile.type || "audio/webm";
    if (!Array.from(ALLOWED_AUDIO_TYPES).some((value) => mimeType.startsWith(value.split(";")[0]))) {
      return NextResponse.json({ error: "UNSUPPORTED_AUDIO_TYPE" }, { status: 400 });
    }

    const consultRef = adminDb.doc(`consultations/${consultationId}`);
    const consultSnap = await consultRef.get();
    if (!consultSnap.exists) {
      return NextResponse.json(
        { error: "Consultation not found" },
        { status: 404 }
      );
    }

    const consultation = consultSnap.data()!;
    if (
      consultation.workerUid !== authUser.uid &&
      consultation.lawyerUid !== authUser.uid
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const bucket = getStorage().bucket();
    const recordingId = crypto.randomUUID();
    const extension =
      mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
    const fileName = `${recordingId}.${extension}`;
    const storagePath = `recordings/${consultationId}/${fileName}`;
    const file = bucket.file(storagePath);
    const uploadedAt = new Date().toISOString();

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    await file.save(buffer, {
      resumable: false,
      metadata: {
        contentType: mimeType,
        cacheControl: "private, max-age=0, no-transform",
        metadata: {
          consultationId,
          uploadedByUid: authUser.uid,
        },
      },
    });

    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const uploadedByRole =
      consultation.lawyerUid === authUser.uid ? "lawyer" : "worker";

    await consultRef.collection("recordings").doc(recordingId).set({
      id: recordingId,
      consultationId,
      storagePath,
      fileName,
      mimeType,
      sizeBytes: buffer.length,
      sha256,
      uploadedAt,
      uploadedByUid: authUser.uid,
      uploadedByRole,
      durationSec: consultation.durationSec ?? 0,
    });

    await consultRef.set(
      {
        recordingPath: storagePath,
        recordingHash: sha256,
        recordingCount: FieldValue.increment(1),
        recordingLatestPath: storagePath,
        recordingUpdatedAt: uploadedAt,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      recordingId,
      recordingPath: storagePath,
      recordingHash: sha256,
    });
  } catch (err) {
    if (err instanceof RequestAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    console.error("Upload recording error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
