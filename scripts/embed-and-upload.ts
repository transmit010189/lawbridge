import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
import { embedTexts } from "../src/lib/ai/embeddingClient";
import { buildSearchTokens } from "../src/lib/rag/searchTokens";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBED_DIM = 768;
const VECTOR_DISTANCE_MEASURE = "COSINE";

type RagSourceType = "law" | "wda_policy" | "wda_faq" | "attachment";

interface RagChunk {
  chunkId: string;
  sourceId: string;
  sourceType: RagSourceType;
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

function deriveSourceTitle(chunk: RagChunk) {
  if (chunk.sourceType === "law") {
    return chunk.title.replace(/\s第\s.+$/, "").trim();
  }
  return chunk.title;
}

function deriveSearchTokens(chunk: RagChunk) {
  return buildSearchTokens(
    [
      chunk.title,
      chunk.sectionPath,
      chunk.articleNo,
      chunk.text.slice(0, 1200),
      chunk.tags.join(" "),
    ],
    80
  );
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

async function main() {
  const hasGoogleCredentials = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
  );

  if (!GEMINI_API_KEY && !hasGoogleCredentials) {
    throw new Error(
      "Missing credentials. Set GEMINI_API_KEY and Firebase admin credentials."
    );
  }

  const chunksPath = path.join(process.cwd(), "data", "chunks", "_all_chunks.json");
  if (!fs.existsSync(chunksPath)) {
    throw new Error("Missing data/chunks/_all_chunks.json. Run npm run rag:build first.");
  }

  const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8")) as RagChunk[];
  const db = await getFirestore();
  const { FieldValue } = await import("firebase-admin/firestore");

  const batchVersion = Date.now().toString();
  console.log(`Starting upload batch: ${batchVersion}`);
  console.log(`Embedding ${chunks.length} chunks...`);

  const embeddings: number[][] = [];
  const embedBatchSize = 16;

  for (let index = 0; index < chunks.length; index += embedBatchSize) {
    const batch = chunks.slice(index, index + embedBatchSize);
    const vectors = await embedTexts(
      batch.map((chunk) => chunk.text),
      {
        apiKey: GEMINI_API_KEY,
        outputDimensionality: EMBED_DIM,
        taskType: "RETRIEVAL_DOCUMENT",
      }
    );
    embeddings.push(...vectors);
    console.log(
      `Embedded ${Math.min(index + batch.length, chunks.length)}/${chunks.length}`
    );
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  const sources = new Map<string, RagChunk>();
  for (const chunk of chunks) {
    if (!sources.has(chunk.sourceId)) {
      sources.set(chunk.sourceId, chunk);
    }
  }

  console.log(`Uploading ${sources.size} sources...`);
  for (const [sourceId, chunk] of sources.entries()) {
    await db.collection("kb_sources").doc(sourceId).set(
      {
        sourceType: chunk.sourceType,
        title: deriveSourceTitle(chunk),
        language: chunk.language,
        sourcePath: chunk.sourceUrl,
        version: new Date().toISOString().slice(0, 10),
        status: "active",
        jurisdiction: chunk.jurisdiction,
        effectiveDate: chunk.effectiveDate,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  console.log(`Uploading ${chunks.length} chunks...`);
  const firestoreBatchSize = 50;

  for (let index = 0; index < chunks.length; index += firestoreBatchSize) {
    const batch = db.batch();
    const slice = chunks.slice(index, index + firestoreBatchSize);

    slice.forEach((chunk, sliceIndex) => {
      const searchTokens = deriveSearchTokens(chunk);
      batch.set(db.collection("kb_chunks").doc(chunk.chunkId), {
        sourceId: chunk.sourceId,
        sourceType: chunk.sourceType,
        title: chunk.title,
        text: chunk.text,
        embedding: FieldValue.vector(embeddings[index + sliceIndex]),
        chunkNo: chunk.chunkNo,
        sectionPath: chunk.sectionPath,
        articleNo: chunk.articleNo,
        language: chunk.language,
        tags: chunk.tags,
        effectiveDate: chunk.effectiveDate,
        jurisdiction: chunk.jurisdiction,
        isActive: chunk.isActive,
        sourceUrl: chunk.sourceUrl,
        searchTokens,
        createdAt: FieldValue.serverTimestamp(),
        batchVersion,
      });
    });

    await batch.commit();
    console.log(
      `Uploaded ${Math.min(index + slice.length, chunks.length)}/${chunks.length}`
    );
  }

  console.log("Pruning stale chunks...");
  for (const sourceId of sources.keys()) {
    const snapshot = await db
      .collection("kb_chunks")
      .where("sourceId", "==", sourceId)
      .get();
    let deleteBatch = db.batch();
    let queuedDeletes = 0;

    for (const doc of snapshot.docs) {
      if (doc.data().batchVersion === batchVersion) {
        continue;
      }

      deleteBatch.delete(doc.ref);
      queuedDeletes += 1;

      if (queuedDeletes % 400 === 0) {
        await deleteBatch.commit();
        deleteBatch = db.batch();
      }
    }

    if (queuedDeletes > 0 && queuedDeletes % 400 !== 0) {
      await deleteBatch.commit();
    }
  }

  console.log("Upload complete.");
  console.log(`Vector field: embedding (${EMBED_DIM} dimensions)`);
  console.log(`Distance measure: ${VECTOR_DISTANCE_MEASURE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
