import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

// Recalculate lawyer's average rating from all their ratings
export async function POST(req: NextRequest) {
  try {
    const { lawyerUid } = await req.json();
    if (!lawyerUid) {
      return NextResponse.json({ error: "Missing lawyerUid" }, { status: 400 });
    }

    const ratingsSnap = await adminDb
      .collection("ratings")
      .where("lawyerUid", "==", lawyerUid)
      .get();

    if (ratingsSnap.empty) {
      return NextResponse.json({ ratingAvg: 0, ratingCount: 0 });
    }

    let total = 0;
    let count = 0;
    ratingsSnap.forEach((doc) => {
      const stars = doc.data().stars;
      if (typeof stars === "number" && stars >= 1 && stars <= 5) {
        total += stars;
        count++;
      }
    });

    const ratingAvg = count > 0 ? Math.round((total / count) * 10) / 10 : 0;

    // Update the lawyer profile
    const profileRef = adminDb.doc(`lawyer_profiles/${lawyerUid}`);
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      await profileRef.update({
        ratingAvg,
        ratingCount: count,
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ratingAvg, ratingCount: count });
  } catch (err) {
    console.error("Update rating error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
