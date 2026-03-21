"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  ExternalLink,
  Info,
  Loader2,
  Mic,
  MicOff,
  Send,
  Square,
  User,
  Volume2,
  Zap,
} from "lucide-react";
import { useAuthContext } from "@/components/auth/AuthProvider";
import { interpolate, useTranslation } from "@/hooks/useTranslation";
import type { SupportedLocale } from "@/types";

interface Props {
  locale: SupportedLocale;
}

interface SourceItem {
  title: string;
  articleNo?: string;
  sectionPath?: string;
  sourceUrl?: string;
}

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  sources?: SourceItem[];
}

function formatSourceLabel(source: SourceItem) {
  if (source.articleNo) {
    return `${source.title} ${source.articleNo}`;
  }
  if (source.sectionPath) {
    return `${source.title} ${source.sectionPath}`;
  }
  return source.title;
}

function uniqueSources(sources: SourceItem[] = []) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = [source.title, source.articleNo, source.sectionPath, source.sourceUrl]
      .filter(Boolean)
      .join("::");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function AiChatPage({ locale }: Props) {
  const { user } = useAuthContext();
  const t = useTranslation(locale);
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "ai", text: t.aiChat.welcome },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ remaining: number; limit: number; plan: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{
    stop: () => void;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }

    fetch(`/api/ai/quota?uid=${user.uid}`)
      .then((response) => response.json())
      .then((data) =>
        setQuota({
          remaining: data.remaining,
          limit: data.limit,
          plan: data.plan,
        })
      )
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    setMessages((current) => {
      if (current.length === 1 && current[0]?.id === "welcome") {
        return [{ id: "welcome", role: "ai", text: t.aiChat.welcome }];
      }
      return current;
    });
  }, [t.aiChat.welcome]);

  const handleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionConstructor =
      typeof window !== "undefined"
        ? (window as typeof window & {
            SpeechRecognition?: new () => {
              lang: string;
              interimResults: boolean;
              onstart: (() => void) | null;
              onend: (() => void) | null;
              onresult: ((event: {
                resultIndex: number;
                results: ArrayLike<{
                  isFinal: boolean;
                  0: { transcript: string };
                }>;
              }) => void) | null;
              start: () => void;
              stop: () => void;
            };
            webkitSpeechRecognition?: new () => {
              lang: string;
              interimResults: boolean;
              onstart: (() => void) | null;
              onend: (() => void) | null;
              onresult: ((event: {
                resultIndex: number;
                results: ArrayLike<{
                  isFinal: boolean;
                  0: { transcript: string };
                }>;
              }) => void) | null;
              start: () => void;
              stop: () => void;
            };
          }).SpeechRecognition ||
          (window as typeof window & {
            SpeechRecognition?: new () => {
              lang: string;
              interimResults: boolean;
              onstart: (() => void) | null;
              onend: (() => void) | null;
              onresult: ((event: {
                resultIndex: number;
                results: ArrayLike<{
                  isFinal: boolean;
                  0: { transcript: string };
                }>;
              }) => void) | null;
              start: () => void;
              stop: () => void;
            };
            webkitSpeechRecognition?: new () => {
              lang: string;
              interimResults: boolean;
              onstart: (() => void) | null;
              onend: (() => void) | null;
              onresult: ((event: {
                resultIndex: number;
                results: ArrayLike<{
                  isFinal: boolean;
                  0: { transcript: string };
                }>;
              }) => void) | null;
              start: () => void;
              stop: () => void;
            };
          }).webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionConstructor) {
      alert(t.common.speechNotSupported);
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = locale === "zh-TW" ? "zh-TW" : "en-US";
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => {
      let finalTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          finalTranscript += event.results[index][0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        setInput((current) =>
          current ? `${current} ${finalTranscript.trim()}` : finalTranscript.trim()
        );
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleSpeak = (messageId: string, text: string) => {
    if (typeof window === "undefined") {
      return;
    }

    if (speakingId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    setSpeakingId(messageId);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "zh-TW" ? "zh-TW" : "en-US";
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: question,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      if (user) {
        try {
          const quotaResponse = await fetch("/api/ai/quota", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: user.uid }),
          });
          const quotaData = await quotaResponse.json();
          setQuota({
            remaining: quotaData.remaining,
            limit: quotaData.limit,
            plan: quotaData.plan || "free",
          });

          if (!quotaData.allowed) {
            setMessages((current) => [
              ...current,
              {
                id: `ai-${Date.now()}`,
                role: "ai",
                text: interpolate(t.aiChat.dailyLimitReached, {
                  limit: quotaData.limit,
                }),
              },
            ]);
            return;
          }
        } catch {
          // Allow the request even if quota refresh fails.
        }
      }

      const response = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, locale }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        error?: string;
        sources?: SourceItem[];
      };

      if (!response.ok) {
        throw new Error(payload.error || t.aiChat.error);
      }

      setMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now()}`,
          role: "ai",
          text: payload.answer || t.aiChat.error,
          sources: payload.sources || [],
        },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now()}`,
          role: "ai",
          text: err instanceof Error ? err.message : t.aiChat.error,
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex min-h-[72vh] flex-col rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
              <Bot className="h-5 w-5 text-emerald-600" />
              {t.aiChat.title}
            </h2>
            <p className="mt-2 text-sm text-slate-500">{t.aiChat.subtitle}</p>
          </div>
          {quota ? (
            <div className="shrink-0 flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              {quota.remaining}/{quota.limit}
              <span className="text-slate-400">{t.aiChat.quotaUnit}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 sm:px-6">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t.aiChat.disclaimer}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((message) => {
          const allSources = uniqueSources(message.sources);
          const visibleSources = allSources.slice(0, 4);
          const hiddenSourceCount = allSources.length - visibleSources.length;

          return (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "ai" ? (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <Bot className="h-4 w-4 text-emerald-700" />
                </div>
              ) : null}

              <div
                className={`max-w-[92%] rounded-[1.5rem] px-4 py-3 text-sm leading-7 shadow-sm sm:max-w-[82%] ${
                  message.role === "user"
                    ? "rounded-br-md bg-[var(--brand-ink)] text-white"
                    : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="whitespace-pre-wrap flex-1">{message.text}</p>
                  {message.role === "ai" && message.id !== "welcome" ? (
                    <button
                      type="button"
                      onClick={() => handleSpeak(message.id, message.text)}
                      className="shrink-0 rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:text-emerald-600"
                      title="Read aloud"
                    >
                      {speakingId === message.id ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                </div>

                {message.role === "ai" && visibleSources.length ? (
                  <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
                    <p className="uppercase tracking-[0.24em] text-slate-400">
                      {t.aiChat.sources}
                    </p>
                    <ol className="mt-2 space-y-2">
                      {visibleSources.map((source, index) => (
                        <li
                          key={`${formatSourceLabel(source)}-${index}`}
                          className="flex gap-2"
                        >
                          <span className="shrink-0 text-slate-400">
                            [{index + 1}]
                          </span>
                          {source.sourceUrl ? (
                            <a
                              href={source.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[var(--brand-accent)] hover:underline"
                            >
                              <span>{formatSourceLabel(source)}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span>{formatSourceLabel(source)}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    {hiddenSourceCount > 0 ? (
                      <p className="mt-2 text-slate-400">
                        {interpolate(t.aiChat.moreSources, {
                          count: hiddenSourceCount,
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {message.role === "user" ? (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <User className="h-4 w-4 text-slate-700" />
                </div>
              ) : null}
            </div>
          );
        })}

        {isLoading ? (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Bot className="h-4 w-4 text-emerald-700" />
            </div>
            <div className="rounded-[1.5rem] rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t.aiChat.thinking}
              </div>
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleListen}
            className={`flex shrink-0 items-center justify-center rounded-[1.3rem] border p-3 transition sm:px-4 sm:py-3 ${
              isListening
                ? "animate-pulse border-rose-200 bg-rose-50 text-rose-600"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
            title="Voice input"
          >
            {isListening ? (
              <Mic className="h-5 w-5" />
            ) : (
              <MicOff className="h-5 w-5" />
            )}
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t.aiChat.placeholder}
            disabled={isLoading}
            className="min-w-0 flex-1 rounded-[1.3rem] border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[rgba(184,100,67,0.45)] focus:ring-4 focus:ring-[rgba(184,100,67,0.08)] disabled:bg-slate-50"
          />

          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-[1.3rem] bg-[var(--brand-ink)] px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <Send className="h-4 w-4" />
            {t.aiChat.send}
          </button>
        </div>
      </div>
    </div>
  );
}
