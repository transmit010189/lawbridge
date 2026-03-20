async function main() {
  const dotenv = await import("dotenv");
  const adminApp = await import("firebase-admin/app");
  const adminFirestore = await import("firebase-admin/firestore");

  dotenv.config({ path: ".env.local" });

  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  adminApp.initializeApp({ credential: adminApp.cert(key) });
  const db = adminFirestore.getFirestore();
  const { FieldValue } = adminFirestore;

  const sources = await db.collection("kb_sources").count().get();
  console.log("kb_sources count:", sources.data().count);

  const chunks = await db.collection("kb_chunks").count().get();
  console.log("kb_chunks count:", chunks.data().count);

  if (chunks.data().count > 0) {
    const doc = await db.collection("kb_chunks").limit(1).get();
    console.log("Sample chunk id:", doc.docs[0].id);
    console.log("Sample chunk title:", doc.docs[0].data().title);

    try {
      // Test a dummy vector search (needs the vector index to be ready).
      // Distance measure is selected on the query, not in firestore.indexes.json.
      const dummyVec = new Array(768).fill(0.01);
      const search = await db
        .collection("kb_chunks")
        .where("isActive", "==", true)
        .findNearest("embedding", FieldValue.vector(dummyVec), {
          limit: 1,
          distanceMeasure: "COSINE",
        })
        .get();
      console.log("Vector search test:", search.docs.length, "results");
    } catch (e) {
      console.log("Vector search error (Index likely building):", e.message);
    }
  }
}

main().catch(console.error);
