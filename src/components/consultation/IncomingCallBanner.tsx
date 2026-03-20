"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Phone, PhoneOff } from "lucide-react";
import type { SupportedLocale } from "@/types";

interface IncomingCall {
  consultationId: string;
  workerUid: string;
  ratePerMinute: number;
}

interface Props {
  lawyerUid: string;
  locale: SupportedLocale;
  onAccept: (call: IncomingCall) => void;
}

const en = {
  incoming: "Incoming call",
  accept: "Accept",
  decline: "Decline",
  perMin: "pts/min",
};

const zh = {
  incoming: "來電通知",
  accept: "接聽",
  decline: "拒接",
  perMin: "點/分",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

export function IncomingCallBanner({ lawyerUid, locale, onAccept }: Props) {
  const copy = getCopy(locale);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  useEffect(() => {
    // Listen for consultations where this lawyer is the target and status is "requested"
    const q = query(
      collection(db, "consultations"),
      where("lawyerUid", "==", lawyerUid),
      where("status", "==", "requested")
    );

    const unsub = onSnapshot(q, (snap) => {
      const calls: IncomingCall[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        calls.push({
          consultationId: doc.id,
          workerUid: data.workerUid,
          ratePerMinute: data.ratePerMinute || 10,
        });
      });
      // Show the most recent incoming call
      setIncomingCall(calls.length > 0 ? calls[calls.length - 1] : null);
    });

    return () => unsub();
  }, [lawyerUid]);

  const handleDecline = async () => {
    if (!incomingCall) return;
    try {
      await updateDoc(doc(db, "consultations", incomingCall.consultationId), {
        status: "cancelled",
      });
    } catch (err) {
      console.error("Decline error:", err);
    }
    setIncomingCall(null);
  };

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="w-full max-w-md animate-bounce rounded-[1.6rem] border border-emerald-200 bg-white px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.2)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Phone className="h-6 w-6 text-emerald-600 animate-pulse" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">{copy.incoming}</p>
              <p className="text-sm text-slate-500">
                {incomingCall.ratePerMinute} {copy.perMin}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDecline}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 transition hover:bg-red-200"
              title={copy.decline}
            >
              <PhoneOff className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                onAccept(incomingCall);
                setIncomingCall(null);
              }}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              {copy.accept}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
