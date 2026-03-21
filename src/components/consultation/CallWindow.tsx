"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  doc,
  onSnapshot,
  collection,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { authenticatedFetch } from "@/lib/api/authenticatedFetch";
import { Mic, MicOff, PhoneOff, Loader2, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { SupportedLocale } from "@/types";

interface CallWindowProps {
  consultationId: string;
  role: "worker" | "lawyer";
  peerName: string;
  ratePerMinute: number;
  locale: SupportedLocale;
  onEnd: (durationSec: number) => void;
  onError: (msg: string) => void;
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
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function CallWindow({
  consultationId,
  role,
  peerName,
  ratePerMinute,
  locale,
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
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const remoteSourceConnectedRef = useRef(false);
  const [status, setStatus] = useState<"connecting" | "waiting" | "active" | "ended">("connecting");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupTransport = useCallback(async () => {
    stopTimer();
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    remoteAudioRef.current?.removeAttribute("src");
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    remoteSourceConnectedRef.current = false;

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
        recorder.addEventListener(
          "stop",
          () => resolve(),
          { once: true }
        );
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

  const connectRemoteStreamToRecording = useCallback((remoteStream: MediaStream) => {
    if (
      remoteSourceConnectedRef.current ||
      !audioContextRef.current ||
      !recordingDestinationRef.current
    ) {
      return;
    }

    const remoteSource = audioContextRef.current.createMediaStreamSource(remoteStream);
    remoteSource.connect(recordingDestinationRef.current);
    remoteSourceConnectedRef.current = true;
  }, []);

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
          const callerCandidatesRef = collection(consultationRef, "callerCandidates");

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
            if (!data) return;

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
          const calleeCandidatesRef = collection(consultationRef, "calleeCandidates");

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              void addDoc(calleeCandidatesRef, event.candidate.toJSON());
            }
          };

          setStatus("waiting");

          const consultationSnap = await getDoc(consultationRef);
          const consultationData = consultationSnap.data();

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
            if (
              data &&
              (data.status === "completed" || data.status === "cancelled")
            ) {
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

  if (status === "ended") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/30 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        <audio ref={remoteAudioRef} autoPlay playsInline />

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
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>

          <button
            type="button"
            onClick={() => {
              void endCall(true);
            }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600"
            title={t.call.endCall}
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}
