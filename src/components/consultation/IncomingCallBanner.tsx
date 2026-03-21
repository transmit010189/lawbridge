"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { Globe2, Languages, Phone, PhoneOff } from "lucide-react";
import { db } from "@/lib/firebase/client";
import { localeNames } from "@/lib/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import type { SupportedLocale } from "@/types";

interface IncomingCall {
  consultationId: string;
  workerUid: string;
  workerDisplayName?: string;
  workerLanguage?: SupportedLocale;
  workerNationality?: string;
  ratePerMinute: number;
  translationMode?: "none" | "subtitle_assist";
}

interface Props {
  lawyerUid: string;
  locale: SupportedLocale;
  onAccept: (call: IncomingCall) => void;
}

export function IncomingCallBanner({ lawyerUid, locale, onAccept }: Props) {
  const t = useTranslation(locale);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "consultations"),
      where("lawyerUid", "==", lawyerUid),
      where("status", "==", "requested")
    );

    const unsub = onSnapshot(q, (snap) => {
      const calls: IncomingCall[] = [];
      snap.forEach((snapshot) => {
        const data = snapshot.data();
        calls.push({
          consultationId: snapshot.id,
          workerUid: data.workerUid,
          workerDisplayName: data.workerDisplayName || "Worker",
          workerLanguage: data.workerLanguage || "zh-TW",
          workerNationality: data.workerNationality || "",
          ratePerMinute: Math.max(25, data.ratePerMinute || 25),
          translationMode: data.translationMode || "none",
        });
      });

      setIncomingCall(calls.length > 0 ? calls[calls.length - 1] : null);
    });

    return () => unsub();
  }, [lawyerUid]);

  const handleDecline = async () => {
    if (!incomingCall) {
      return;
    }

    try {
      await updateDoc(doc(db, "consultations", incomingCall.consultationId), {
        status: "cancelled",
      });
    } catch (err) {
      console.error("Decline error:", err);
    }

    setIncomingCall(null);
  };

  const translationLabel = useMemo(() => {
    if (!incomingCall?.workerLanguage) {
      return "";
    }

    return localeNames[incomingCall.workerLanguage] || incomingCall.workerLanguage;
  }, [incomingCall?.workerLanguage]);

  if (!incomingCall) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="w-full max-w-xl overflow-hidden rounded-[1.7rem] border border-emerald-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)]">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(135deg,#0f172a,#1e293b)] px-5 py-4 text-white">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12">
                <Phone className="h-6 w-6 animate-pulse text-emerald-300" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/60">
                  LawBridge Call
                </p>
                <p className="mt-1 text-lg font-semibold">{t.incomingCall.incoming}</p>
              </div>
            </div>
            <div className="rounded-full border border-white/16 bg-white/10 px-3 py-1 text-xs text-white/82">
              {incomingCall.ratePerMinute} {t.incomingCall.perMin}
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <p className="text-lg font-semibold text-slate-900">
              {incomingCall.workerDisplayName || "Worker"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {incomingCall.workerNationality
                ? `${incomingCall.workerNationality} worker`
                : "New consultation request"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {incomingCall.workerNationality ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                <Globe2 className="h-3.5 w-3.5" />
                {incomingCall.workerNationality}
              </span>
            ) : null}
            {translationLabel ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-700">
                <Languages className="h-3.5 w-3.5" />
                {translationLabel}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDecline}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-600 transition hover:bg-rose-200"
              title={t.incomingCall.decline}
            >
              <PhoneOff className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                onAccept(incomingCall);
                setIncomingCall(null);
              }}
              className="inline-flex flex-1 items-center justify-center rounded-[1.1rem] bg-emerald-500 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
            >
              {t.incomingCall.accept}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
