import {
  GEMINI_EMBEDDING_MODEL,
  USE_VERTEX_EMBEDDING,
  VERTEX_AI_EMBEDDING_MODEL,
  VERTEX_AI_LOCATION,
  VERTEX_AI_PROJECT_ID,
} from "@/lib/ai/geminiModels";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

interface EmbedOptions {
  apiKey?: string;
  outputDimensionality?: number;
  taskType?: EmbeddingTaskType;
  title?: string;
}

interface GeminiBatchResponse {
  embeddings: Array<{ values: number[] }>;
}

interface GeminiSingleResponse {
  embedding: { values: number[] };
}

interface VertexPredictResponse {
  predictions?: Array<{
    embeddings?: {
      values?: number[];
    };
  }>;
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

async function getGoogleAccessToken() {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token) {
    throw new Error("Unable to resolve a Google Cloud access token for Vertex AI.");
  }

  return token;
}

async function embedWithVertex(
  texts: string[],
  { outputDimensionality = 768, taskType = "RETRIEVAL_DOCUMENT", title }: EmbedOptions
) {
  if (!VERTEX_AI_PROJECT_ID) {
    throw new Error("VERTEX_AI_PROJECT_ID is not configured.");
  }

  const accessToken = await getGoogleAccessToken();
  const endpoint = `https://${VERTEX_AI_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_AI_PROJECT_ID}/locations/${VERTEX_AI_LOCATION}/publishers/google/models/${VERTEX_AI_EMBEDDING_MODEL}:predict`;
  const embeddings: number[][] = [];

  for (const text of texts) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        instances: [
          {
            content: text,
            task_type: taskType,
            ...(title ? { title } : {}),
          },
        ],
        parameters: {
          outputDimensionality,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Vertex AI embedding error ${response.status}: ${await response.text()}`
      );
    }

    const payload = (await response.json()) as VertexPredictResponse;
    const values = payload.predictions?.[0]?.embeddings?.values;
    if (!values?.length) {
      throw new Error("Vertex AI embedding response did not contain any values.");
    }
    embeddings.push(normalizeVector(values));
  }

  return embeddings;
}

async function embedWithGeminiApi(
  texts: string[],
  { apiKey, outputDimensionality = 768, taskType = "RETRIEVAL_DOCUMENT", title }: EmbedOptions
) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  if (texts.length === 1) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_EMBEDDING_MODEL,
        content: { parts: [{ text: texts[0] }] },
        taskType,
        outputDimensionality,
        ...(title ? { title } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Gemini embedding error ${response.status}: ${await response.text()}`
      );
    }

    const payload = (await response.json()) as GeminiSingleResponse;
    return [normalizeVector(payload.embedding.values)];
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: GEMINI_EMBEDDING_MODEL,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality,
        ...(title ? { title } : {}),
      })),
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Gemini batch embedding error ${response.status}: ${await response.text()}`
    );
  }

  const payload = (await response.json()) as GeminiBatchResponse;
  return payload.embeddings.map((item) => normalizeVector(item.values));
}

export async function embedTexts(texts: string[], options: EmbedOptions = {}) {
  if (texts.length === 0) {
    return [];
  }

  if (USE_VERTEX_EMBEDDING) {
    try {
      return await embedWithVertex(texts, options);
    } catch (error) {
      console.warn("Vertex AI embedding failed, falling back to Gemini API.", error);
    }
  }

  return embedWithGeminiApi(texts, options);
}

export async function embedText(text: string, options: EmbedOptions = {}) {
  const [embedding] = await embedTexts([text], options);
  return embedding;
}
