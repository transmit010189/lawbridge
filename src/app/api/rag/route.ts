import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { embedText } from "@/lib/ai/embeddingClient";
import { GEMINI_GENERATION_MODEL } from "@/lib/ai/geminiModels";
import {
  buildQuestionSearchTokens,
  buildSearchTokens,
  countTokenOverlap,
  normalizeSearchText,
} from "@/lib/rag/searchTokens";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_DIM = 768;
const VECTOR_DISTANCE_MEASURE = "COSINE" as const;
const VECTOR_LIMIT = 18;
const LEXICAL_LIMIT = 24;
const CONTEXT_LIMIT = 6;
const FOOTNOTE_LIMIT = 6;

interface RagContext {
  title: string;
  text: string;
  articleNo?: string;
  sectionPath?: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
  searchTokens: string[];
  vectorRank?: number;
  lexicalHits: number;
}

function buildSourceUrl(
  sourceType?: string,
  sourceId?: string,
  sourceUrl?: string
) {
  if (sourceUrl) {
    return sourceUrl;
  }

  if (sourceType === "law" && sourceId) {
    return `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${sourceId}`;
  }

  return undefined;
}

function toContext(doc: FirebaseFirestore.QueryDocumentSnapshot, vectorRank?: number) {
  const data = doc.data();

  return {
    title: String(data.title || ""),
    text: String(data.text || ""),
    articleNo: data.articleNo ? String(data.articleNo) : undefined,
    sectionPath: data.sectionPath ? String(data.sectionPath) : undefined,
    sourceId: data.sourceId ? String(data.sourceId) : undefined,
    sourceType: data.sourceType ? String(data.sourceType) : undefined,
    sourceUrl: buildSourceUrl(
      data.sourceType ? String(data.sourceType) : undefined,
      data.sourceId ? String(data.sourceId) : undefined,
      data.sourceUrl ? String(data.sourceUrl) : undefined
    ),
    searchTokens: Array.isArray(data.searchTokens)
      ? data.searchTokens.filter((item: unknown): item is string => typeof item === "string")
      : [],
    vectorRank,
    lexicalHits: 0,
  } satisfies RagContext;
}

async function embedQuery(text: string) {
  return embedText(text, {
    apiKey: GEMINI_API_KEY,
    outputDimensionality: EMBED_DIM,
    taskType: "RETRIEVAL_QUERY",
  });
}

async function fetchVectorContexts(question: string) {
  const queryVector = await embedQuery(question);
  const snapshot = await adminDb
    .collection("kb_chunks")
    .where("isActive", "==", true)
    .findNearest("embedding", FieldValue.vector(queryVector), {
      limit: VECTOR_LIMIT,
      distanceMeasure: VECTOR_DISTANCE_MEASURE,
    })
    .get();

  return snapshot.docs.map((doc, index) => toContext(doc, index));
}

async function fetchLexicalContexts(question: string) {
  const lexicalTokens = buildQuestionSearchTokens(question, 30);
  if (lexicalTokens.length === 0) {
    return [];
  }

  const snapshot = await adminDb
    .collection("kb_chunks")
    .where("searchTokens", "array-contains-any", lexicalTokens)
    .limit(LEXICAL_LIMIT)
    .get();

  return snapshot.docs
    .map((doc) => toContext(doc))
    .filter((context) => context.text && context.title);
}

function formatContextLabel(context: RagContext) {
  if (context.articleNo) {
    return `${context.title} ${context.articleNo}`;
  }

  if (context.sectionPath) {
    return `${context.title} ${context.sectionPath}`;
  }

  return context.title;
}

function mergeContexts(question: string, contexts: RagContext[]) {
  const questionTokens = new Set(buildQuestionSearchTokens(question, 30));
  const questionSearchTokens = buildSearchTokens([question], 60);
  const merged = new Map<string, RagContext>();

  for (const context of contexts) {
    const key = [
      context.sourceId,
      context.title,
      context.articleNo,
      context.sectionPath,
    ]
      .filter(Boolean)
      .join("::");

    const lexicalHits =
      context.searchTokens.length > 0
        ? countTokenOverlap(questionSearchTokens, [context.searchTokens.join(" ")])
        : 0;

    const existing = merged.get(key);
    if (existing) {
      existing.vectorRank = Math.min(
        existing.vectorRank ?? Number.POSITIVE_INFINITY,
        context.vectorRank ?? Number.POSITIVE_INFINITY
      );
      if (!Number.isFinite(existing.vectorRank)) {
        existing.vectorRank = undefined;
      }
      existing.lexicalHits = Math.max(existing.lexicalHits, lexicalHits);
      continue;
    }

    merged.set(key, {
      ...context,
      lexicalHits,
      searchTokens:
        context.searchTokens.length > 0
          ? context.searchTokens
          : Array.from(questionTokens),
    });
  }

  return Array.from(merged.values());
}

function scoreContext(question: string, context: RagContext) {
  const questionTokens = buildQuestionSearchTokens(question, 30);
  const normalizedQuestion = normalizeSearchText(question);
  const normalizedTitle = normalizeSearchText(context.title);
  const normalizedSection = normalizeSearchText(context.sectionPath || "");
  const normalizedBody = normalizeSearchText(context.text.slice(0, 1200));

  let score = 0;

  if (typeof context.vectorRank === "number") {
    score += Math.max(0, VECTOR_LIMIT - context.vectorRank) * 3;
  }

  score += context.lexicalHits * 12;
  score += countTokenOverlap(questionTokens, [context.title]) * 8;
  score += countTokenOverlap(questionTokens, [context.sectionPath || ""]) * 4;
  score += countTokenOverlap(questionTokens, [context.text.slice(0, 600)]) * 2;

  if (normalizedQuestion && normalizedTitle.includes(normalizedQuestion)) {
    score += 24;
  }
  if (normalizedQuestion && normalizedSection.includes(normalizedQuestion)) {
    score += 14;
  }
  if (normalizedQuestion.length >= 2 && normalizedBody.includes(normalizedQuestion)) {
    score += 10;
  }

  if (context.sourceType === "wda_faq") {
    score += 6;
  } else if (context.sourceType === "law") {
    score += 4;
  } else if (context.sourceType === "wda_policy") {
    score += 2;
  } else if (context.sourceType === "attachment") {
    score -= 1;
  }

  return score;
}

function rerankContexts(question: string, contexts: RagContext[]) {
  return mergeContexts(question, contexts)
    .map((context) => ({
      ...context,
      score: scoreContext(question, context),
    }))
    .sort((left, right) => right.score - left.score);
}

function buildFootnotes(contexts: RagContext[]) {
  const seen = new Set<string>();

  return contexts
    .filter((context) => {
      const key = [
        context.title,
        context.articleNo,
        context.sectionPath,
        context.sourceUrl,
      ]
        .filter(Boolean)
        .join("::");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, FOOTNOTE_LIMIT)
    .map((context) => ({
      title: context.title,
      articleNo: context.articleNo,
      sectionPath: context.sectionPath,
      sourceId: context.sourceId,
      sourceUrl: context.sourceUrl,
    }));
}

async function generateAnswer(
  question: string,
  locale: string,
  contexts: RagContext[]
) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  if (contexts.length === 0) {
    return locale === "zh-TW"
      ? "目前沒有檢索到足夠且相關的法規、政策或問答資料，無法可靠回答這個問題。"
      : "I could not retrieve enough relevant legal or policy material to answer reliably.";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_GENERATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const contextText = contexts
    .map((context, index) => `[${index + 1}] ${formatContextLabel(context)}\n${context.text}`)
    .join("\n\n---\n\n");

  const isZh = locale === "zh-TW";
  const systemPrompt = isZh
    ? [
        "你是 LawBridge 的台灣勞動法與移工政策檢索助理。",
        "只能根據提供的檢索內容作答，不得自行補充未檢索到的法律結論。",
        "請先給結論，再列出理由與依據。",
        "若資料不足、互相矛盾或無法直接回答，必須明講不確定。",
        "回答保持精簡，不要大量貼原文，因為前端會另外顯示來源註腳。",
      ].join("\n")
    : [
        "You are LawBridge's Taiwan labor-law and migrant-policy retrieval assistant.",
        "Answer only from the retrieved material provided below.",
        "Lead with the conclusion, then explain the basis briefly.",
        "If the material is insufficient or off-topic, say so explicitly.",
      ].join("\n");

  const userPrompt = isZh
    ? `以下是檢索到的法規、政策、問答與附件資料：\n\n${contextText}\n\n請用繁體中文回答這個問題：${question}`
    : `Retrieved legal, policy, FAQ, and attachment context:\n\n${contextText}\n\nPlease answer this question in English: ${question}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1536 },
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "No answer generated.";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const locale = typeof body.locale === "string" ? body.locale : "zh-TW";

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const [vectorContexts, lexicalContexts] = await Promise.all([
      fetchVectorContexts(question),
      fetchLexicalContexts(question),
    ]);

    const ranked = rerankContexts(question, [...vectorContexts, ...lexicalContexts]);
    const selected = ranked.slice(0, CONTEXT_LIMIT);
    const answer = await generateAnswer(question, locale, selected);

    return NextResponse.json({
      answer,
      sources: buildFootnotes(selected),
      chunksSearched: vectorContexts.length,
      lexicalCandidates: lexicalContexts.length,
      reranked: ranked.length,
    });
  } catch (error) {
    console.error("RAG query error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
