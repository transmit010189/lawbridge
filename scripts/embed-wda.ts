/**
 * WDA 中階技術人力計畫 Embedding 生成與上傳腳本
 * npx tsx scripts/embed-wda.ts
 */
import { config as loadEnv } from "dotenv";
import * as fs from 'fs';
import * as path from 'path';
import { adminDb } from '../src/lib/firebase/admin';
import { GoogleGenerativeAI } from "@google/generative-ai";

loadEnv({ path: ".env.local" });

const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error("Missing GEMINI_API_KEY in .env.local");
}

const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

async function main() {
  const filePath = path.join(process.cwd(), 'data/chunks/wda_faq_chunks.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const chunks = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`🚀 Preparing to embed and upload ${chunks.length} WDA chunks...`);
  
  // 1. Write the source metadata
  await adminDb.collection('kb_sources').doc('WDA_MID_LABOR').set({
      id: 'WDA_MID_LABOR',
      title: '留用外國中階技術工作人力計畫資訊專頁',
      sourceType: 'policy_faq',
      jurisdiction: 'Taiwan',
      effectiveDate: '2023-01-01',
      version: '1.0',
      status: 'active',
      addedAt: new Date().toISOString()
  }, { merge: true });

  console.log("✅ WDA Source explicitly registered in kb_sources.");

  // 2. Process embeddings in batches
  let batch = adminDb.batch();
  let count = 0;
  
  for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      try {
          const res = await model.embedContent(c.text);
          const values = res.embedding.values;
          
          batch.set(adminDb.collection('kb_chunks').doc(c.id), { ...c, embedding: values });
          count++;
          process.stdout.write(`✅ ${count}/${chunks.length}\r`);
          
          if (count % 50 === 0) {
              await batch.commit();
              batch = adminDb.batch();
              // respect rate limits
              await new Promise(r => setTimeout(r, 1000));
          }
      } catch (err) {
          console.error(`\n❌ Error embedding chunk ${c.id}:`, err);
      }
  }
  
  if (count % 50 !== 0) {
      await batch.commit();
  }
  
  console.log(`\n🎉 Successfully uploaded ${count} WDA vectors to kb_chunks!`);
}

main().catch(console.error);
