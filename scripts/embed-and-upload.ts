import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_DIM = 768;
const VECTOR_DISTANCE_MEASURE = "COSINE";
const EMBEDDING_MODEL = "models/gemini-embedding-001";
const BATCH_EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;

interface RagChunk {
  chunkId: string;
  sourceId: string;
  sourceType: "law" | "wda_policy";
  title: string;
  text: string;
  chunkNo: number;
  sectionPath: string;
  articleNo: string;
  language: "zh-TW";
  tags: string[];
  effectiveDate: string;
  jurisdiction: "TW";
  isActive: boolean;
  sourceUrl: string;
}

function normalizeVector(vector: number[]) {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? vector : vector.map((value) => value / norm);
}

async function getFirestore() {
  const adminApp = await import("firebase-admin/app");
  const adminFirestore = await import("firebase-admin/firestore");

  if (adminApp.getApps().length === 0) {
    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (keyJson) {
      adminApp.initializeApp({
        credential: adminApp.cert(JSON.parse(keyJson)),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      adminApp.initializeApp();
    } else {
      throw new Error(
        "Missing FIREBASE_SERVICE_ACCOUNT_KEY or GOOGLE_APPLICATION_CREDENTIALS"
      );
    }
  }

  return adminFirestore.getFirestore();
}

async function batchEmbed(texts: string[]) {
  const requests = texts.map((text) => ({
    model: EMBEDDING_MODEL,
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_DOCUMENT",
    outputDimensionality: EMBED_DIM,
  }));

  const response = await fetch(BATCH_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const payload = (await response.json()) as {
    embeddings: { values: number[] }[];
  };

  return payload.embeddings.map((embedding) => normalizeVector(embedding.values));
}

function deriveSourceTitle(chunk: RagChunk) {
  if (chunk.sourceType === "law") {
    return chunk.title.replace(/\s第\s?.+$/, "").trim();
  }

  return chunk.title;
}

async function main() {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY in .env.local");
  }

  const chunksPath = path.join(process.cwd(), "data", "chunks", "_all_chunks.json");
  if (!fs.existsSync(chunksPath)) {
    throw new Error("Missing data/chunks/_all_chunks.json. Run build-rag-corpus first.");
  }

  const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8")) as RagChunk[];
  const db = await getFirestore();
  const { FieldValue } = await import("firebase-admin/firestore");

  console.log(`Embedding ${chunks.length} chunks...`);

  const embeddings: number[][] = [];
  const batchSize = 20;

  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize);
    const vectors = await batchEmbed(batch.map((chunk) => chunk.text));
    embeddings.push(...vectors);
    console.log(`Embedded ${Math.min(index + batch.length, chunks.length)}/${chunks.length}`);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  const sources = new Map<string, RagChunk>();
  for (const chunk of chunks) {
    if (!sources.has(chunk.sourceId)) {
      sources.set(chunk.sourceId, chunk);
    }
  }

  console.log(`Uploading ${sources.size} sources...`);
  for (const [sourceId, chunk] of sources.entries()) {
    await db.collection("kb_sources").doc(sourceId).set({
      sourceType: chunk.sourceType,
      title: deriveSourceTitle(chunk),
      language: chunk.language,
      sourcePath: chunk.sourceUrl,
      version: new Date().toISOString().slice(0, 10),
      status: "active",
      jurisdiction: chunk.jurisdiction,
      effectiveDate: chunk.effectiveDate,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  console.log(`Uploading ${chunks.length} chunks...`);
  const firestoreBatchSize = 50;

  for (let index = 0; index < chunks.length; index += firestoreBatchSize) {
    const batch = db.batch();
    const slice = chunks.slice(index, index + firestoreBatchSize);

    slice.forEach((chunk, sliceIndex) => {
      const embedding = embeddings[index + sliceIndex];
      batch.set(db.collection("kb_chunks").doc(chunk.chunkId), {
        sourceId: chunk.sourceId,
        sourceType: chunk.sourceType,
        title: chunk.title,
        text: chunk.text,
        embedding: FieldValue.vector(embedding),
        chunkNo: chunk.chunkNo,
        sectionPath: chunk.sectionPath,
        articleNo: chunk.articleNo,
        language: chunk.language,
        tags: chunk.tags,
        effectiveDate: chunk.effectiveDate,
        jurisdiction: chunk.jurisdiction,
        isActive: chunk.isActive,
        sourceUrl: chunk.sourceUrl,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    console.log(`Uploaded ${Math.min(index + slice.length, chunks.length)}/${chunks.length}`);
  }

  console.log("Upload complete.");
  console.log(`Vector field: embedding (${EMBED_DIM} dimensions)`);
  console.log(`Distance measure (query-time): ${VECTOR_DISTANCE_MEASURE}`);
  console.log("Composite index pre-filters: isActive");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
