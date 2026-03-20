import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_DIM = 768;
const VECTOR_DISTANCE_MEASURE = "COSINE" as const;
const EMBEDDING_MODEL = "models/gemini-embedding-001";
const GENERATION_MODEL = "models/gemini-2.0-flash";
const VECTOR_LIMIT = 8;
const CONTEXT_LIMIT = 4;
const FOOTNOTE_LIMIT = 4;

interface RagContext {
  title: string;
  text: string;
  articleNo?: string;
  sectionPath?: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
}

async function embedQuery(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBED_DIM,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const payload = (await response.json()) as { embedding: { values: number[] } };
  const vector = payload.embedding.values;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

function buildSourceUrl(sourceType?: string, sourceId?: string, sourceUrl?: string) {
  if (sourceUrl) return sourceUrl;
  if (sourceType === "law" && sourceId) {
    return `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${sourceId}`;
  }
  return undefined;
}

function formatContextLabel(context: RagContext) {
  if (context.articleNo) {
    return context.articleNo.includes("條")
      ? `${context.title} ${context.articleNo}`
      : `${context.title} 第 ${context.articleNo} 條`;
  }
  if (context.sectionPath) {
    return `${context.title} ${context.sectionPath}`;
  }
  return context.title;
}

function buildFootnotes(contexts: RagContext[]) {
  const seen = new Set<string>();
  return contexts.filter((context) => {
    const key = [context.title, context.articleNo, context.sectionPath, context.sourceUrl]
      .filter(Boolean)
      .join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, FOOTNOTE_LIMIT).map((context) => ({
    title: context.title,
    articleNo: context.articleNo,
    sectionPath: context.sectionPath,
    sourceId: context.sourceId,
    sourceUrl: context.sourceUrl,
  }));
}

async function generateAnswer(question: string, locale: string, contexts: RagContext[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${GENERATION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const contextText = contexts
    .map((context, index) => `[${index + 1}] ${formatContextLabel(context)}\n${context.text}`)
    .join("\n\n---\n\n");

  const isZh = locale === "zh-TW";
  const systemPrompt = isZh
    ? [
        "你是 LawBridge 的勞動法檢索助手。",
        "只能根據提供的檢索內容作答，不可捏造資訊。",
        "先給結論，再整理重點。",
        "若資料不足，請明確說明。",
        "不要輸出過長法條全文，來源會由系統另外附上註腳。",
      ].join("\n")
    : [
        "You are LawBridge's labor-law retrieval assistant.",
        "Answer only from the supplied retrieved material.",
        "Lead with the conclusion and keep the answer concise.",
        "If the sources are insufficient, say so explicitly.",
        "Do not output long source dumps because the UI adds footnotes separately.",
      ].join("\n");

  const userPrompt = isZh
    ? `以下是檢索到的法規與政策內容：\n\n${contextText}\n\n請用繁體中文回答這個問題：${question}`
    : `Retrieved legal and policy context:\n\n${contextText}\n\nPlease answer this question in English: ${question}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1536 },
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

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const queryVector = await embedQuery(question);
    const snapshot = await adminDb
      .collection("kb_chunks")
      .where("isActive", "==", true)
      .findNearest("embedding", FieldValue.vector(queryVector), {
        limit: VECTOR_LIMIT,
        distanceMeasure: VECTOR_DISTANCE_MEASURE,
      })
      .get();

    const contexts: RagContext[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        title: data.title as string,
        text: data.text as string,
        articleNo: data.articleNo as string | undefined,
        sectionPath: data.sectionPath as string | undefined,
        sourceId: data.sourceId as string | undefined,
        sourceType: data.sourceType as string | undefined,
        sourceUrl: buildSourceUrl(
          data.sourceType as string | undefined,
          data.sourceId as string | undefined,
          data.sourceUrl as string | undefined
        ),
      };
    });

    const answer = await generateAnswer(question, locale, contexts.slice(0, CONTEXT_LIMIT));

    return NextResponse.json({
      answer,
      sources: buildFootnotes(contexts),
      chunksSearched: contexts.length,
    });
  } catch (error) {
    console.error("RAG query error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
