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
import { Mic, MicOff, PhoneOff, Loader2, Clock } from "lucide-react";
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

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const en = {
  connecting: "Connecting...",
  waitingLawyer: "Waiting for lawyer to accept...",
  waitingWorker: "Incoming call...",
  inCall: "In call",
  mute: "Mute",
  unmute: "Unmute",
  endCall: "End call",
  perMin: "pts/min",
  elapsed: "Elapsed",
  charged: "Charged",
  pts: "pts",
};

const zh = {
  connecting: "連線中...",
  waitingLawyer: "等待律師接聽...",
  waitingWorker: "來電中...",
  inCall: "通話中",
  mute: "靜音",
  unmute: "取消靜音",
  endCall: "結束通話",
  perMin: "點/分",
  elapsed: "已通話",
  charged: "已扣",
  pts: "點",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
  const copy = getCopy(locale);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "waiting" | "active" | "ended"
  >("connecting");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current = null;
  }, []);

  const endCall = useCallback(() => {
    const duration = elapsed;
    cleanup();
    setStatus("ended");
    onEnd(duration);
  }, [elapsed, cleanup, onEnd]);

  // Timer
  useEffect(() => {
    if (status === "active") {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // WebRTC + Firestore signaling
  useEffect(() => {
    let cancelled = false;
    const unsubscribers: (() => void)[] = [];

    async function initCall() {
      try {
        // Get microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;

        // Create peer connection
        const pc = new RTCPeerConnection(STUN_SERVERS);
        pcRef.current = pc;

        // Add local audio track
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Handle remote audio
        pc.ontrack = (event) => {
          if (remoteAudioRef.current && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
        };

        pc.onconnectionstatechange = () => {
          if (
            pc.connectionState === "disconnected" ||
            pc.connectionState === "failed"
          ) {
            endCall();
          }
        };

        const consultDocRef = doc(db, "consultations", consultationId);

        if (role === "worker") {
          // CALLER: create offer
          const callerCandidatesRef = collection(
            consultDocRef,
            "callerCandidates"
          );

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              addDoc(callerCandidatesRef, event.candidate.toJSON());
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          await updateDoc(consultDocRef, {
            offer: { type: offer.type, sdp: offer.sdp },
            status: "requested",
          });

          setStatus("waiting");

          // Listen for answer
          const unsubAnswer = onSnapshot(consultDocRef, (snap) => {
            const data = snap.data();
            if (!data) return;

            if (data.status === "cancelled") {
              cleanup();
              setStatus("ended");
              onError("Call was cancelled");
              return;
            }

            if (data.answer && !pc.currentRemoteDescription) {
              const answer = new RTCSessionDescription(data.answer);
              pc.setRemoteDescription(answer).then(() => {
                setStatus("active");
              });
            }
          });
          unsubscribers.push(unsubAnswer);

          // Listen for callee ICE candidates
          const unsubCalleeCandidates = onSnapshot(
            collection(consultDocRef, "calleeCandidates"),
            (snap) => {
              snap.docChanges().forEach((change) => {
                if (change.type === "added") {
                  const candidate = new RTCIceCandidate(change.doc.data());
                  pc.addIceCandidate(candidate);
                }
              });
            }
          );
          unsubscribers.push(unsubCalleeCandidates);
        } else {
          // CALLEE (lawyer): wait for offer, then create answer
          const calleeCandidatesRef = collection(
            consultDocRef,
            "calleeCandidates"
          );

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              addDoc(calleeCandidatesRef, event.candidate.toJSON());
            }
          };

          setStatus("waiting");

          // Get the offer
          const consultSnap = await getDoc(consultDocRef);
          const consultData = consultSnap.data();

          if (consultData?.offer) {
            await pc.setRemoteDescription(
              new RTCSessionDescription(consultData.offer)
            );
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await updateDoc(consultDocRef, {
              answer: { type: answer.type, sdp: answer.sdp },
              status: "in_progress",
              startedAt: new Date().toISOString(),
            });

            setStatus("active");
          }

          // Listen for caller ICE candidates
          const callerCandidatesSnap = await getDocs(
            collection(consultDocRef, "callerCandidates")
          );
          callerCandidatesSnap.forEach((doc) => {
            pc.addIceCandidate(new RTCIceCandidate(doc.data()));
          });

          const unsubCallerCandidates = onSnapshot(
            collection(consultDocRef, "callerCandidates"),
            (snap) => {
              snap.docChanges().forEach((change) => {
                if (change.type === "added") {
                  const candidate = new RTCIceCandidate(change.doc.data());
                  pc.addIceCandidate(candidate);
                }
              });
            }
          );
          unsubscribers.push(unsubCallerCandidates);

          // Listen for call end
          const unsubEnd = onSnapshot(consultDocRef, (snap) => {
            const data = snap.data();
            if (
              data &&
              (data.status === "completed" || data.status === "cancelled")
            ) {
              cleanup();
              setStatus("ended");
            }
          });
          unsubscribers.push(unsubEnd);
        }
      } catch (err) {
        console.error("Call init error:", err);
        onError(err instanceof Error ? err.message : "Call failed");
      }
    }

    initCall();

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
      cleanup();
    };
  }, [consultationId, role, cleanup, onEnd, onError, endCall]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMuted(!audioTrack.enabled);
      }
    }
  };

  const currentCharge = Math.max(1, Math.ceil(elapsed / 60)) * ratePerMinute;

  if (status === "ended") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/30 bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
        {/* Hidden audio element for remote stream */}
        <audio ref={remoteAudioRef} autoPlay playsInline />

        {/* Status */}
        <div className="text-center">
          <div
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
              status === "active"
                ? "bg-emerald-100 animate-pulse"
                : "bg-slate-100"
            }`}
          >
            {status === "active" ? (
              <Clock className="h-10 w-10 text-emerald-600" />
            ) : (
              <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
            )}
          </div>

          <p className="mt-4 text-lg font-semibold text-slate-900">
            {peerName}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {ratePerMinute} {copy.perMin}
          </p>

          {status === "connecting" && (
            <p className="mt-3 text-sm text-slate-400">{copy.connecting}</p>
          )}
          {status === "waiting" && (
            <p className="mt-3 text-sm text-amber-600">
              {role === "worker" ? copy.waitingLawyer : copy.waitingWorker}
            </p>
          )}
          {status === "active" && (
            <div className="mt-4 space-y-1">
              <p className="text-3xl font-bold text-slate-900 tabular-nums">
                {formatTime(elapsed)}
              </p>
              <p className="text-sm text-slate-500">
                {copy.charged}: {currentCharge} {copy.pts}
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-8 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-14 w-14 items-center justify-center rounded-full transition ${
              muted
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            title={muted ? copy.unmute : copy.mute}
          >
            {muted ? (
              <MicOff className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </button>

          <button
            type="button"
            onClick={endCall}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition hover:bg-red-600"
            title={copy.endCall}
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}
