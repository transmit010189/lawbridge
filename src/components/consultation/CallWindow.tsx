"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import {
  AudioLines,
  Clock,
  Globe2,
  Languages,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Square,
  Volume2,
} from "lucide-react";
import { db } from "@/lib/firebase/client";
import { authenticatedFetch } from "@/lib/api/authenticatedFetch";
import { localeNames } from "@/lib/i18n";
import { useTranslation } from "@/hooks/useTranslation";
import type { SupportedLocale } from "@/types";

interface CallWindowProps {
  consultationId: string;
  role: "worker" | "lawyer";
  peerName: string;
  ratePerMinute: number;
  locale: SupportedLocale;
  workerLanguage?: SupportedLocale;
  workerNationality?: string;
  translationMode?: "none" | "subtitle_assist";
  onEnd: (durationSec: number) => void;
  onError: (msg: string) => void;
}

interface CallMeta {
  workerLanguage?: SupportedLocale;
  workerNationality?: string;
  translationMode?: "none" | "subtitle_assist";
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  0: {
    transcript: string;
  };
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<BrowserSpeechRecognitionResult>;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

const RTC_CONFIGURATION = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function formatTime(sec: number) {
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function toSpeechLocale(locale: string) {
  switch (locale) {
    case "zh-TW":
      return "zh-TW";
    case "id":
      return "id-ID";
    case "vi":
      return "vi-VN";
    case "th":
      return "th-TH";
    default:
      return "en-US";
  }
}

export function CallWindow({
  consultationId,
  role,
  peerName,
  ratePerMinute,
  locale,
  workerLanguage,
  workerNationality,
  translationMode,
  onEnd,
  onError,
}: CallWindowProps) {
  const t = useTranslation(locale);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const endingRef = useRef(false);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingDestinationRef =
    useRef<MediaStreamAudioDestinationNode | null>(null);
  const remoteSourceConnectedRef = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const [status, setStatus] = useState<
    "connecting" | "waiting" | "active" | "ended"
  >("connecting");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [callMeta, setCallMeta] = useState<CallMeta>({
    workerLanguage,
    workerNationality,
    translationMode,
  });
  const [translationInput, setTranslationInput] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [translationListening, setTranslationListening] = useState(false);
  const [speakingTranslation, setSpeakingTranslation] = useState(false);

  const showTranslationAssist = useMemo(() => {
    return (
      callMeta.translationMode === "subtitle_assist" ||
      callMeta.workerLanguage === "en" ||
      callMeta.workerLanguage === "id" ||
      callMeta.workerLanguage === "vi" ||
      callMeta.workerLanguage === "th"
    );
  }, [callMeta.translationMode, callMeta.workerLanguage]);

  const assistSourceLanguage =
    role === "lawyer" ? "zh-TW" : callMeta.workerLanguage || locale;
  const assistTargetLanguage =
    role === "lawyer" ? callMeta.workerLanguage || "en" : "zh-TW";

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupTransport = useCallback(async () => {
    stopTimer();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    remoteSourceConnectedRef.current = false;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.removeAttribute("src");
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      recordingDestinationRef.current = null;
    }
  }, [stopTimer]);

  const uploadRecording = useCallback(async () => {
    if (chunksRef.current.length === 0) {
      return;
    }

    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("consultationId", consultationId);
      formData.append("audio", blob, `recording-${consultationId}.webm`);
      await authenticatedFetch("/api/consultation/upload-recording", {
        method: "POST",
        body: formData,
      });
    } catch (err) {
      console.error("Recording upload failed:", err);
    } finally {
      chunksRef.current = [];
    }
  }, [consultationId]);

  const finalizeRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (!recorder) {
      chunksRef.current = [];
      return;
    }

    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.requestData();
        recorder.stop();
      });
    }

    await uploadRecording();
  }, [uploadRecording]);

  const endCall = useCallback(
    async (notifyParent = true) => {
      if (endingRef.current) {
        return;
      }

      endingRef.current = true;
      const duration = elapsedRef.current;
      setStatus("ended");

      try {
        await finalizeRecording();
      } finally {
        await cleanupTransport();
        if (notifyParent) {
          onEnd(duration);
        }
      }
    },
    [cleanupTransport, finalizeRecording, onEnd]
  );

  const setupRecordingMix = useCallback((localStream: MediaStream) => {
    if (typeof AudioContext === "undefined") {
      return;
    }

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const localSource = audioContext.createMediaStreamSource(localStream);
    localSource.connect(destination);

    audioContextRef.current = audioContext;
    recordingDestinationRef.current = destination;
    remoteSourceConnectedRef.current = false;
  }, []);

  const connectRemoteStreamToRecording = useCallback(
    (remoteStream: MediaStream) => {
      if (
        remoteSourceConnectedRef.current ||
        !audioContextRef.current ||
        !recordingDestinationRef.current
      ) {
        return;
      }

      const remoteSource =
        audioContextRef.current.createMediaStreamSource(remoteStream);
      remoteSource.connect(recordingDestinationRef.current);
      remoteSourceConnectedRef.current = true;
    },
    []
  );

  const runTranslation = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !showTranslationAssist) {
        return;
      }

      setTranslationLoading(true);
      setTranslationError("");

      try {
        const res = await authenticatedFetch("/api/consultation/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            consultationId,
            text: trimmed,
            sourceLanguage: assistSourceLanguage,
            targetLanguage: assistTargetLanguage,
          }),
        });

        const data = (await res.json()) as {
          translatedText?: string;
          error?: string;
        };

        if (!res.ok || !data.translatedText) {
          throw new Error(data.error || "TRANSLATION_FAILED");
        }

        setTranslatedText(data.translatedText);
      } catch (err) {
        console.error("Translation error:", err);
        setTranslationError(
          locale === "zh-TW"
            ? "目前無法完成翻譯，請改用手動溝通或稍後再試。"
            : "Translation is unavailable right now."
        );
      } finally {
        setTranslationLoading(false);
      }
    },
    [
      assistSourceLanguage,
      assistTargetLanguage,
      consultationId,
      locale,
      showTranslationAssist,
    ]
  );

  const toggleTranslationListening = useCallback(() => {
    if (!showTranslationAssist) {
      return;
    }

    if (translationListening) {
      recognitionRef.current?.stop();
      setTranslationListening(false);
      return;
    }

    const SpeechRecognitionConstructor =
      typeof window !== "undefined"
        ? (window as typeof window & {
            SpeechRecognition?: BrowserSpeechRecognitionConstructor;
            webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
          }).SpeechRecognition ||
          (window as typeof window & {
            SpeechRecognition?: BrowserSpeechRecognitionConstructor;
            webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
          }).webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionConstructor) {
      setTranslationError(
        locale === "zh-TW"
          ? "目前瀏覽器不支援語音辨識，請改用手動輸入。"
          : "Speech recognition is not supported in this browser."
      );
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = toSpeechLocale(assistSourceLanguage);
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setTranslationListening(true);
    recognition.onend = () => setTranslationListening(false);
    recognition.onerror = () => setTranslationListening(false);
    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          finalTranscript += event.results[index][0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        setTranslationInput(finalTranscript.trim());
        void runTranslation(finalTranscript.trim());
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [
    assistSourceLanguage,
    locale,
    runTranslation,
    showTranslationAssist,
    translationListening,
  ]);

  const speakTranslation = () => {
    if (!translatedText || typeof window === "undefined") {
      return;
    }

    if (speakingTranslation) {
      window.speechSynthesis.cancel();
      setSpeakingTranslation(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.lang = toSpeechLocale(assistTargetLanguage);
    utterance.onend = () => setSpeakingTranslation(false);
    utterance.onerror = () => setSpeakingTranslation(false);
    setSpeakingTranslation(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (status !== "active") {
      return;
    }

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      elapsedRef.current = nextElapsed;
      setElapsed(nextElapsed);
    }, 1000);

    const recordingStream =
      recordingDestinationRef.current?.stream || localStreamRef.current;

    if (recordingStream && typeof MediaRecorder !== "undefined") {
      try {
        const recorder = new MediaRecorder(recordingStream, {
          mimeType: "audio/webm;codecs=opus",
        });
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };
        recorder.start(1000);
        recorderRef.current = recorder;
      } catch {
        recorderRef.current = null;
      }
    }

    return stopTimer;
  }, [status, stopTimer]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];

    async function initCall() {
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = localStream;
        setupRecordingMix(localStream);

        const pc = new RTCPeerConnection(RTC_CONFIGURATION);
        pcRef.current = pc;
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

        pc.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (!remoteStream) {
            return;
          }

          remoteStreamRef.current = remoteStream;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
          }
          connectRemoteStreamToRecording(remoteStream);
        };

        pc.onconnectionstatechange = () => {
          if (
            pc.connectionState === "disconnected" ||
            pc.connectionState === "failed" ||
            pc.connectionState === "closed"
          ) {
            void endCall(true);
          }
        };

        const consultationRef = doc(db, "consultations", consultationId);

        if (role === "worker") {
          const callerCandidatesRef = collection(
            consultationRef,
            "callerCandidates"
          );

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              void addDoc(callerCandidatesRef, event.candidate.toJSON());
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          await updateDoc(consultationRef, {
            offer: { type: offer.type, sdp: offer.sdp },
            status: "requested",
          });

          setStatus("waiting");

          const unsubAnswer = onSnapshot(consultationRef, (snapshot) => {
            const data = snapshot.data();
            if (!data) {
              return;
            }

            setCallMeta({
              workerLanguage: data.workerLanguage || workerLanguage,
              workerNationality: data.workerNationality || workerNationality,
              translationMode: data.translationMode || translationMode,
            });

            if (data.status === "cancelled") {
              setStatus("ended");
              void cleanupTransport();
              onError("Call was cancelled");
              return;
            }

            if (data.answer && !pc.currentRemoteDescription) {
              const answer = new RTCSessionDescription(data.answer);
              void pc.setRemoteDescription(answer).then(() => {
                setStatus("active");
              });
            }
          });
          unsubscribers.push(unsubAnswer);

          const unsubCalleeCandidates = onSnapshot(
            collection(consultationRef, "calleeCandidates"),
            (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                  const candidate = new RTCIceCandidate(change.doc.data());
                  void pc.addIceCandidate(candidate);
                }
              });
            }
          );
          unsubscribers.push(unsubCalleeCandidates);
        } else {
          const calleeCandidatesRef = collection(
            consultationRef,
            "calleeCandidates"
          );

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              void addDoc(calleeCandidatesRef, event.candidate.toJSON());
            }
          };

          setStatus("waiting");

          const consultationSnap = await getDoc(consultationRef);
          const consultationData = consultationSnap.data();

          if (consultationData) {
            setCallMeta({
              workerLanguage: consultationData.workerLanguage || workerLanguage,
              workerNationality:
                consultationData.workerNationality || workerNationality,
              translationMode:
                consultationData.translationMode || translationMode,
            });
          }

          if (consultationData?.offer) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(consultationData.offer)
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await updateDoc(consultationRef, {
              answer: { type: answer.type, sdp: answer.sdp },
              status: "in_progress",
              startedAt: new Date().toISOString(),
            });

            setStatus("active");
          }

          const callerCandidatesSnap = await getDocs(
            collection(consultationRef, "callerCandidates")
          );
          callerCandidatesSnap.forEach((snapshot) => {
            void pc.addIceCandidate(new RTCIceCandidate(snapshot.data()));
          });

          const unsubCallerCandidates = onSnapshot(
            collection(consultationRef, "callerCandidates"),
            (snapshot) => {
              snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                  const candidate = new RTCIceCandidate(change.doc.data());
                  void pc.addIceCandidate(candidate);
                }
              });
            }
          );
          unsubscribers.push(unsubCallerCandidates);

          const unsubEnd = onSnapshot(consultationRef, (snapshot) => {
            const data = snapshot.data();
            if (!data) {
              return;
            }

            setCallMeta({
              workerLanguage: data.workerLanguage || workerLanguage,
              workerNationality: data.workerNationality || workerNationality,
              translationMode: data.translationMode || translationMode,
            });

            if (data.status === "completed" || data.status === "cancelled") {
              void endCall(false);
            }
          });
          unsubscribers.push(unsubEnd);
        }
      } catch (err) {
        console.error("Call init error:", err);
        onError(err instanceof Error ? err.message : "Call failed");
      }
    }

    void initCall();

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
      void endCall(false);
    };
  }, [
    cleanupTransport,
    connectRemoteStreamToRecording,
    consultationId,
    endCall,
    onError,
    role,
    setupRecordingMix,
    translationMode,
    workerLanguage,
    workerNationality,
  ]);

  const toggleMute = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioTrack) {
      return;
    }

    audioTrack.enabled = !audioTrack.enabled;
    setMuted(!audioTrack.enabled);
  };

  const currentCharge = Math.max(1, Math.ceil(elapsed / 60)) * ratePerMinute;
  const workerLanguageLabel = callMeta.workerLanguage
    ? localeNames[callMeta.workerLanguage]
    : "";

  if (status === "ended") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div
        className={`w-full rounded-[2rem] border border-white/30 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)] ${
          showTranslationAssist ? "max-w-5xl" : "max-w-md"
        }`}
      >
        <audio ref={remoteAudioRef} autoPlay playsInline />

        <div className={`grid gap-0 ${showTranslationAssist ? "lg:grid-cols-[420px_minmax(0,1fr)]" : ""}`}>
          <div className="p-6">
            <div className="text-center">
              <div
                className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
                  status === "active" ? "animate-pulse bg-emerald-100" : "bg-slate-100"
                }`}
              >
                {status === "active" ? (
                  <Clock className="h-10 w-10 text-emerald-600" />
                ) : (
                  <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
                )}
              </div>

              <p className="mt-4 text-lg font-semibold text-slate-900">{peerName}</p>
              <p className="mt-1 text-sm text-slate-500">
                {ratePerMinute} {t.call.perMin}
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {callMeta.workerNationality ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    <Globe2 className="h-3.5 w-3.5" />
                    {callMeta.workerNationality}
                  </span>
                ) : null}
                {workerLanguageLabel ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-700">
                    <Languages className="h-3.5 w-3.5" />
                    {workerLanguageLabel}
                  </span>
                ) : null}
              </div>

              {status === "connecting" ? (
                <p className="mt-3 text-sm text-slate-400">{t.call.connecting}</p>
              ) : null}
              {status === "waiting" ? (
                <p className="mt-3 text-sm text-amber-600">
                  {role === "worker" ? t.call.waitingLawyer : t.call.waitingWorker}
                </p>
              ) : null}
              {status === "active" ? (
                <div className="mt-4 space-y-1">
                  <p className="text-3xl font-bold tabular-nums text-slate-900">
                    {formatTime(elapsed)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t.call.charged}: {currentCharge} {t.common.pts}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-8 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={toggleMute}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
                  muted
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title={muted ? t.call.unmute : t.call.mute}
              >
                {muted ? (
                  <MicOff className="h-6 w-6" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  void endCall(true);
                }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600"
                title={t.call.endCall}
              >
                <PhoneOff className="h-7 w-7" />
              </button>
            </div>
          </div>

          {showTranslationAssist ? (
            <div className="border-t border-slate-200 bg-slate-50/70 p-6 lg:border-l lg:border-t-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                    Live Assist
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">
                    通話翻譯輔助
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    先將你要說的內容輸入或語音辨識，再快速翻成對方語言。這是字幕式輔助，不會直接改變雙方原始音訊。
                  </p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
                  {localeNames[assistSourceLanguage as SupportedLocale] || assistSourceLanguage}
                  {" → "}
                  {localeNames[assistTargetLanguage as SupportedLocale] || assistTargetLanguage}
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-medium text-slate-900">你的發言</p>
                  <textarea
                    value={translationInput}
                    onChange={(event) => setTranslationInput(event.target.value)}
                    rows={7}
                    placeholder={
                      locale === "zh-TW"
                        ? "輸入你想對對方說的內容，或用麥克風做語音辨識。"
                        : "Type what you want to say or use speech recognition."
                    }
                    className="mt-3 w-full rounded-[1.1rem] border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[rgba(184,100,67,0.45)] focus:ring-4 focus:ring-[rgba(184,100,67,0.08)]"
                  />

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={toggleTranslationListening}
                      className={`inline-flex items-center gap-2 rounded-[1rem] px-4 py-2.5 text-sm font-medium transition ${
                        translationListening
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {translationListening ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <AudioLines className="h-4 w-4" />
                      )}
                      {translationListening ? "停止收音" : "語音辨識"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void runTranslation(translationInput)}
                      disabled={!translationInput.trim() || translationLoading}
                      className={`inline-flex items-center gap-2 rounded-[1rem] px-4 py-2.5 text-sm font-medium transition ${
                        translationInput.trim() && !translationLoading
                          ? "bg-slate-900 text-white hover:bg-slate-800"
                          : "cursor-not-allowed bg-slate-200 text-slate-500"
                      }`}
                    >
                      {translationLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      立即翻譯
                    </button>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">翻譯結果</p>
                    <button
                      type="button"
                      onClick={speakTranslation}
                      disabled={!translatedText}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        translatedText
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                      }`}
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      {speakingTranslation ? "停止朗讀" : "朗讀"}
                    </button>
                  </div>

                  <div className="mt-3 min-h-[208px] rounded-[1.1rem] bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
                    {translatedText || "翻譯結果會顯示在這裡。"}
                  </div>

                  {translationError ? (
                    <p className="mt-3 text-sm text-rose-600">{translationError}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
