"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ExternalLink, Info, Loader2, Send, User, Mic, MicOff, Volume2, Square } from "lucide-react";
import type { SupportedLocale } from "@/types";

interface Props {
  locale: SupportedLocale;
}

interface SourceItem {
  title: string;
  articleNo?: string;
  sectionPath?: string;
  sourceId?: string;
  sourceUrl?: string;
}

interface Message {
  id: string;
  role: "user" | "ai";
  text: string;
  sources?: SourceItem[];
}

const en = {
  title: "RAG Legal AI",
  subtitle: "Ask first. Review concise source notes after the answer.",
  placeholder: "For example: Can an employer deduct salary without notice?",
  disclaimer:
    "AI answers are reference only. Please verify the original regulation or consult a licensed lawyer for real cases.",
  welcome:
    "Try asking:\n\n1. Can an employer deduct salary?\n2. How is overtime calculated?\n3. What should I do after a workplace injury?",
  thinking: "Searching regulations and policy materials...",
  error: "The retrieval request failed. Please try again.",
  sources: "Footnotes",
  moreSources: (count: number) => `${count} more sources not shown.`,
  send: "Send",
};

const zh = {
  title: "RAG 法律 AI",
  subtitle: "先提問，再看精簡註腳。",
  placeholder: "例如：雇主可以未告知就扣薪嗎？",
  disclaimer: "AI 回答僅供參考，仍請自行核對原始法規或洽詢正式法律意見。",
  welcome:
    "可以先試問：\n\n1. 雇主可以扣薪嗎？\n2. 加班費怎麼算？\n3. 職災受傷後應該怎麼處理？",
  thinking: "正在檢索法規與政策資料...",
  error: "目前無法完成檢索，請稍後再試。",
  sources: "註腳",
  moreSources: (count: number) => `另有 ${count} 則來源未展開。`,
  send: "送出",
};

function getCopy(locale: SupportedLocale) {
  return locale === "zh-TW" ? zh : en;
}

function formatSourceLabel(source: SourceItem) {
  if (source.articleNo) {
    return source.articleNo.includes("條")
      ? `${source.title} ${source.articleNo}`
      : `${source.title} 第 ${source.articleNo} 條`;
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
  const copy = getCopy(locale);
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "ai", text: copy.welcome },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    setMessages((current) => {
      if (current.length === 1 && current[0]?.id === "welcome") {
        return [{ id: "welcome", role: "ai", text: copy.welcome }];
      }
      return current;
    });
  }, [copy.welcome]);

  const handleListen = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser does not support Speech Recognition");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = locale === "zh-TW" ? "zh-TW" : "en-US";
    recognition.interimResults = true;
    recognitionRef.current = recognition;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
         if (event.results[i].isFinal) {
           finalTranscript += event.results[i][0].transcript;
         }
      }
      if (finalTranscript) {
         setInput((prev) => prev + " " + finalTranscript.trim());
      }
    };
    recognition.start();
  };

  const handleSpeak = (messageId: string, text: string) => {
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
    if (!input.trim() || isLoading) {
      return;
    }

    const question = input.trim();
    setMessages((prev) => [...prev, { id: String(Date.now()), role: "user", text: question }]);
    setInput("");
    setIsLoading(true);

    try {
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
        throw new Error(payload.error || copy.error);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "ai",
          text: payload.answer || copy.error,
          sources: payload.sources || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 2),
          role: "ai",
          text: err instanceof Error ? err.message : copy.error,
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
        <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Bot className="h-5 w-5 text-emerald-600" />
          {copy.title}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{copy.subtitle}</p>
      </div>

      <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 sm:px-6">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{copy.disclaimer}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((message) => {
          const allSources = uniqueSources(message.sources);
          const visibleSources = allSources.slice(0, 4);
          const hiddenSourceCount = allSources.length - visibleSources.length;

          return (
            <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "ai" ? (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <Bot className="h-4 w-4 text-emerald-700" />
                </div>
              ) : null}

              <div className={`max-w-[92%] rounded-[1.5rem] px-4 py-3 text-sm leading-7 shadow-sm sm:max-w-[82%] ${message.role === "user" ? "rounded-br-md bg-[var(--brand-ink)] text-white" : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700"}`}>
                <div className="flex items-start justify-between gap-4">
                  <p className="whitespace-pre-wrap flex-1">{message.text}</p>
                  {message.role === "ai" && message.id !== "welcome" && (
                    <button onClick={() => handleSpeak(message.id, message.text)} className="shrink-0 rounded-full bg-white border border-slate-200 p-1.5 text-slate-400 hover:text-emerald-600 transition shadow-sm" title="Read Aloud">
                       {speakingId === message.id ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                {message.role === "ai" && visibleSources.length ? (
                  <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
                    <p className="uppercase tracking-[0.24em] text-slate-400">{copy.sources}</p>
                    <ol className="mt-2 space-y-2">
                      {visibleSources.map((source, index) => (
                        <li key={`${formatSourceLabel(source)}-${index}`} className="flex gap-2">
                          <span className="shrink-0 text-slate-400">[{index + 1}]</span>
                          {source.sourceUrl ? (
                            <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--brand-accent)] hover:underline">
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
                      <p className="mt-2 text-slate-400">{copy.moreSources(hiddenSourceCount)}</p>
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
                {copy.thinking}
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
             className={`flex shrink-0 items-center justify-center p-3 sm:py-3 sm:px-4 rounded-[1.3rem] transition border ${isListening ? "border-red-200 bg-red-50 text-red-600 animate-pulse" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
             title="Voice Input"
          >
             {isListening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                handleSend();
              }
            }}
            placeholder={copy.placeholder}
            disabled={isLoading}
            className="min-w-0 flex-1 rounded-[1.3rem] border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[rgba(184,100,67,0.45)] focus:ring-4 focus:ring-[rgba(184,100,67,0.08)] disabled:bg-slate-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-[1.3rem] bg-[var(--brand-ink)] px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            <Send className="h-4 w-4" />
            {copy.send}
          </button>
        </div>
      </div>
    </div>
  );
}
