/**
 * 勞發署「留用外國中階技術工作人力計畫資訊專頁」FAQ 爬蟲
 * npx tsx scripts/crawl-wda-faq.ts
 */
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

const TARGET_URL = "https://fw.wda.gov.tw/wda-employer/home/mid-foreign-labor/index/2c95efb386de05e90186dece1ef302e5?locale=zh";
const OUTPUT_FILE = path.join(process.cwd(), 'data/chunks/wda_faq_chunks.json');

async function main() {
  console.log(`📡 Fetching WDA FAQ from: ${TARGET_URL}`);
  
  const response = await fetch(TARGET_URL);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const qas = fallbackExtraction($);
  
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(qas, null, 2));
  
  console.log(`✅ Extracted ${qas.length} FAQ chunks and saved to ${OUTPUT_FILE}`);
}

function fallbackExtraction($: cheerio.CheerioAPI) {
  const qas = [];
  let chunkCount = 0;
  
  // The structure often uses .card or .accordion, we extract paragraphs that look like answers
  const contentAreas = $('.content-wrap, .page-content, main, article, .qa-list, .faq-list').text();
  const textBody = contentAreas || $('body').text();
  
  // Split the text creatively around Question markers or lines
  const parts = textBody.split(/(?=[問Q]\s*[:：]|答\s*[:：])/);
  
  let currentQ = "中階技術人力政策說明";
  
  for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      
      if (part.startsWith('問') || part.startsWith('Q')) {
          currentQ = part.replace(/^[問Q]\s*[:：]?\s*/, '').substring(0, 100);
      } else if (part.startsWith('答') || part.startsWith('A')) {
          const answerText = part.replace(/^[答A]\s*[:：]?\s*/, '').substring(0, 1500);
          if (answerText.length > 10) {
              chunkCount++;
              qas.push({
                  id: `WDA-FAQ-${chunkCount}`,
                  sourceId: "WDA_MID_LABOR",
                  sourceType: "policy_faq",
                  title: "留用外國中階技術人力計畫常見問答",
                  articleNo: `QA-${chunkCount}`,
                  sectionPath: currentQ,
                  text: `問：${currentQ}\n答：${answerText}`,
                  jurisdiction: "Taiwan",
                  effectiveDate: "2023-01-01",
                  language: "zh-TW",
                  isActive: true,
                  sourceUrl: TARGET_URL
              });
          }
      }
  }
  
  // Fallback if the naive split didn't find "問/答" pairs 
  if(qas.length === 0) {
      const paragraphs = $('p, div')
         .map((i, el) => $(el).text().trim())
         .get()
         .filter(t => t.length > 50 && (t.includes('中階技術') || t.includes('雇主') || t.includes('移工')));
         
      // Deduplicate
      const uniqueTexts = [...new Set(paragraphs)];
      
      uniqueTexts.forEach(p => {
          chunkCount++;
          qas.push({
              id: `WDA-TXT-${chunkCount}`,
              sourceId: "WDA_MID_LABOR",
              sourceType: "policy_faq",
              title: "留用外國中階技術人力計畫說明",
              articleNo: `P-${chunkCount}`,
              sectionPath: "內容摘要",
              text: p.substring(0, 1500),
              jurisdiction: "Taiwan",
              effectiveDate: new Date().toISOString().split('T')[0],
              language: "zh-TW",
              isActive: true,
              sourceUrl: TARGET_URL
          });
      })
  }
  
  return qas;
}

main().catch(console.error);
