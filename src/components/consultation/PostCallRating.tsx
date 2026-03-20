"use client";

import { useState } from "react";
import { doc, setDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Star, CheckCircle, Loader2 } from "lucide-react";
import type { SupportedLocale } from "@/types";

interface Props {
  consultationId: string;
  workerUid: string;
  lawyerUid: string;
  lawyerName: string;
  durationSec: number;
  chargedPoints: number;
  locale: SupportedLocale;
  onClose: () => void;
}

const en = {
  title: "Call Ended",
  duration: "Duration",
  charged: "Points charged",
  pts: "pts",
  rateService: "Rate this consultation",
  comment: "Leave a comment (optional)",
  submit: "Submit Rating",
  skip: "Skip",
  thankYou: "Thank you for your feedback!",
  min: "min",
  sec: "sec",
};

const zh = {
  title: "通話結束",
  duration: "通話時長",
  charged: "扣除點數",
  pts: "點",
  rateService: "為這次諮詢評分",
  comment: "留下評論（選填）",
  submit: "提交評分",
  skip: "略過",
  thankYou: "感謝你的回饋！",
  min: "分",
  sec: "秒",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

export function PostCallRating({
  consultationId,
  workerUid,
  lawyerUid,
  lawyerName,
  durationSec,
  chargedPoints,
  locale,
  onClose,
}: Props) {
  const copy = getCopy(locale);
  const [stars, setStars] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;

  const handleSubmit = async () => {
    if (stars === 0) return;
    setSubmitting(true);
    try {
      const ratingRef = doc(collection(db, "ratings"));
      await setDoc(ratingRef, {
        id: ratingRef.id,
        consultationId,
        workerUid,
        lawyerUid,
        stars,
        comment: comment.trim(),
        createdAt: new Date().toISOString(),
      });
      setSubmitted(true);
      setTimeout(onClose, 2000);
    } catch (err) {
      console.error("Rating error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/30 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        {submitted ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500" />
            <p className="mt-4 text-lg font-semibold text-slate-900">{copy.thankYou}</p>
          </div>
        ) : (
          <>
            <h3 className="text-center text-lg font-semibold text-slate-900">{copy.title}</h3>
            <p className="mt-1 text-center text-sm text-slate-500">{lawyerName}</p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
                <p className="text-xs text-slate-400">{copy.duration}</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {minutes}{copy.min} {seconds}{copy.sec}
                </p>
              </div>
              <div className="rounded-[1.2rem] bg-slate-50 px-4 py-3 text-center">
                <p className="text-xs text-slate-400">{copy.charged}</p>
                <p className="mt-1 text-lg font-semibold text-red-500">
                  -{chargedPoints} {copy.pts}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-center text-sm text-slate-600">{copy.rateService}</p>
              <div className="mt-3 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHoveredStar(n)}
                    onMouseLeave={() => setHoveredStar(0)}
                    onClick={() => setStars(n)}
                    className="transition hover:scale-110"
                  >
                    <Star
                      className={`h-8 w-8 ${
                        n <= (hoveredStar || stars)
                          ? "fill-amber-400 text-amber-400"
                          : "text-slate-200"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={copy.comment}
              rows={2}
              className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[rgba(184,100,67,0.45)]"
            />

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-[1.3rem] bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
              >
                {copy.skip}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={stars === 0 || submitting}
                className="flex-1 rounded-[1.3rem] bg-[var(--brand-ink)] px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
                {copy.submit}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
