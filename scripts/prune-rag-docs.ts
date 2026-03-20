import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

interface RagChunk {
  chunkId: string;
  sourceId: string;
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

async function deleteStaleDocuments(
  collectionName: string,
  expectedIds: Set<string>,
  db: FirebaseFirestore.Firestore
) {
  const snapshot = await db.collection(collectionName).get();
  const staleIds = snapshot.docs
    .map((doc) => doc.id)
    .filter((id) => !expectedIds.has(id));

  console.log(`${collectionName}: found ${staleIds.length} stale docs.`);

  for (let index = 0; index < staleIds.length; index += 200) {
    const batch = db.batch();
    staleIds.slice(index, index + 200).forEach((id) => {
      batch.delete(db.collection(collectionName).doc(id));
    });
    await batch.commit();
  }
}

async function main() {
  const chunksPath = path.join(process.cwd(), "data", "chunks", "_all_chunks.json");
  const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8")) as RagChunk[];
  const db = await getFirestore();

  const expectedChunkIds = new Set(chunks.map((chunk) => chunk.chunkId));
  const expectedSourceIds = new Set(chunks.map((chunk) => chunk.sourceId));

  await deleteStaleDocuments("kb_chunks", expectedChunkIds, db);
  await deleteStaleDocuments("kb_sources", expectedSourceIds, db);

  console.log("Prune complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
