"use client";

import { useState } from "react";
import { Loader2, PlayCircle, Download, ShieldCheck } from "lucide-react";
import { authenticatedFetch } from "@/lib/api/authenticatedFetch";
import { useTranslation } from "@/hooks/useTranslation";
import type {
  Consultation,
  ConsultationRecording,
  SupportedLocale,
} from "@/types";

interface Props {
  consultation: Consultation;
  locale: SupportedLocale;
}

export function ConsultationRecordingPanel({ consultation, locale }: Props) {
  const t = useTranslation(locale);
  const hasRecording = Boolean(
    consultation.recordingCount || consultation.recordingPath
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recordings, setRecordings] = useState<ConsultationRecording[] | null>(
    null
  );
  const [activeRecordingId, setActiveRecordingId] = useState("");
  const [activeUrl, setActiveUrl] = useState("");

  const loadRecordings = async () => {
    if (!hasRecording) return;
    setLoading(true);
    setError("");

    try {
      const res = await authenticatedFetch(
        `/api/consultation/recordings?consultationId=${consultation.id}`
      );
      const data = (await res.json()) as {
        recordings?: ConsultationRecording[];
        error?: string;
      };

      if (!res.ok || !data.recordings) {
        throw new Error(data.error || "LOAD_RECORDINGS_FAILED");
      }

      setRecordings(data.recordings);
    } catch (err) {
      console.error("Load recordings error:", err);
      setError(t.recordings.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const accessRecording = async (
    recordingId: string,
    mode: "play" | "download"
  ) => {
    setLoading(true);
    setError("");

    try {
      const res = await authenticatedFetch(
        `/api/consultation/recordings/access?consultationId=${consultation.id}&recordingId=${recordingId}&download=${mode === "download" ? "1" : "0"}`
      );
      const data = (await res.json()) as {
        signedUrl?: string;
        error?: string;
      };

      if (!res.ok || !data.signedUrl) {
        throw new Error(data.error || "ACCESS_RECORDING_FAILED");
      }

      if (mode === "download") {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } else {
        setActiveRecordingId(recordingId);
        setActiveUrl(data.signedUrl);
      }
    } catch (err) {
      console.error("Access recording error:", err);
      setError(t.recordings.accessFailed);
    } finally {
      setLoading(false);
    }
  };

  if (!hasRecording) {
    return (
      <p className="mt-3 text-xs text-slate-400">{t.recordings.none}</p>
    );
  }

  return (
    <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white/70 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-800">
            {t.recordings.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t.recordings.secureNotice}
          </p>
        </div>
        {recordings ? null : (
          <button
            type="button"
            onClick={() => {
              void loadRecordings();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t.recordings.load}
          </button>
        )}
      </div>

      {error ? (
        <p className="mt-3 text-xs text-rose-600">{error}</p>
      ) : null}

      {recordings?.length ? (
        <div className="mt-4 space-y-3">
          {recordings.map((recording) => (
            <div
              key={recording.id}
              className="rounded-[1rem] bg-slate-50 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {recording.fileName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(recording.uploadedAt).toLocaleString(
                      locale === "zh-TW" ? "zh-TW" : "en"
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t.recordings.hash}: {recording.sha256.slice(0, 16)}...
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void accessRecording(recording.id, "play");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    {t.recordings.play}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void accessRecording(recording.id, "download");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t.recordings.download}
                  </button>
                </div>
              </div>

              {activeRecordingId === recording.id && activeUrl ? (
                <audio
                  controls
                  preload="none"
                  src={activeUrl}
                  className="mt-3 w-full"
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : recordings ? (
        <p className="mt-3 text-xs text-slate-500">{t.recordings.none}</p>
      ) : null}
    </div>
  );
}
