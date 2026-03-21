import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { GEMINI_VISION_MODEL } from "@/lib/ai/geminiModels";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// OCR a lawyer's uploaded certificate image using Gemini Vision
export async function POST(req: NextRequest) {
  try {
    const { uid, imageUrl, licenseNoSubmitted } = await req.json();
    if (!uid || !imageUrl) {
      return NextResponse.json({ error: "Missing uid or imageUrl" }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    // Use Gemini Vision to extract text from the certificate image
    const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = `這是一張台灣律師執業證書或身分證明文件的照片。請：
1. 提取所有可見文字（OCR）
2. 找出律師姓名
3. 找出證書編號/律師字號
4. 判斷這是否為有效的律師執業證明

請以 JSON 格式回覆：
{"ocrText": "完整文字", "name": "姓名", "licenseNo": "證號", "isValid": true/false, "confidence": "high/medium/low", "reason": "判斷原因"}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: "" } },
            { fileData: { mimeType: "image/jpeg", fileUri: imageUrl } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });

    let ocrRawText = "";
    let govCheckResult: "matched" | "manual_review" | "failed" = "manual_review";

    if (response.ok) {
      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text || "";
      ocrRawText = text;

      // Try to parse JSON from Gemini response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          ocrRawText = parsed.ocrText || text;

          // Compare extracted license number with submitted one
          if (parsed.licenseNo && licenseNoSubmitted) {
            const extracted = parsed.licenseNo.replace(/\s/g, "");
            const submitted = licenseNoSubmitted.replace(/\s/g, "");
            if (extracted.includes(submitted) || submitted.includes(extracted)) {
              govCheckResult = parsed.isValid && parsed.confidence === "high" ? "matched" : "manual_review";
            } else {
              govCheckResult = "failed";
            }
          }
        }
      } catch {
        // JSON parse failed, leave as manual_review
      }
    }

    // Store verification record
    const now = new Date().toISOString();
    const verificationRef = adminDb.collection("lawyer_verifications").doc();
    await verificationRef.set({
      uid,
      ocrImagePath: imageUrl,
      ocrRawText,
      licenseNoSubmitted: licenseNoSubmitted || "",
      govCheckResult,
      ndaAccepted: false,
      createdAt: now,
    });

    // Update lawyer profile status based on result
    const profileRef = adminDb.doc(`lawyer_profiles/${uid}`);
    const profileSnap = await profileRef.get();
    if (profileSnap.exists) {
      const newStatus = govCheckResult === "matched" ? "verified" : govCheckResult === "failed" ? "rejected" : "pending";
      await profileRef.update({
        licenseStatus: newStatus,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      verificationId: verificationRef.id,
      govCheckResult,
      ocrRawText: ocrRawText.slice(0, 500),
    });
  } catch (err) {
    console.error("Verify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
