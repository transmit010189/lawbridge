/**
 * 法規切塊腳本 — 將爬取的法規 JSON 切分為 RAG 所需的 chunks
 * 用法: npx tsx scripts/chunk-laws.ts
 *
 * 規則 (依據規劃文件):
 *   - 一條一塊
 *   - 每塊保留 articleNo, sectionPath, effectiveDate, jurisdiction metadata
 *   - 控制在 300-900 tokens (中文約 1 字 ≈ 1.5 tokens)
 *   - 很短的條文帶上章節標題作為 context
 */
import * as fs from 'fs';
import * as path from 'path';

interface LawArticle {
  articleNo: string;
  content: string;
  chapter?: string;
  section?: string;
}

interface LawData {
  pcode: string;
  name: string;
  effectiveDate: string;
  chapters: string[];
  articles: LawArticle[];
}

interface Chunk {
  chunkId: string;
  sourceId: string;
  sourceType: 'law';
  title: string;
  text: string;
  chunkNo: number;
  sectionPath: string;
  articleNo: string;
  language: 'zh-TW';
  tags: string[];
  effectiveDate: string;
  jurisdiction: 'TW';
  isActive: boolean;
}

// ── 法規 PCode → 標籤映射 ──
const LAW_TAGS: Record<string, string[]> = {
  N0030001: ['labor', 'employment', 'wages', 'working_hours', 'termination', 'retirement'],
  N0090001: ['employment_service', 'foreign_worker', 'job_agency', 'work_permit'],
  N0090006: ['foreign_worker', 'work_qualification', 'hiring_standard'],
  N0030020: ['retirement', 'pension', 'labor_pension'],
  N0060001: ['occupational_safety', 'workplace_health', 'hazard_prevention'],
  N0030014: ['gender_equality', 'sexual_harassment', 'parental_leave', 'workplace_equality'],
};

function estimateTokens(text: string): number {
  // 粗估：中文 1 字 ≈ 1.5 tokens，英文/數字按空格切
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const rest = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, '').trim();
  const wordTokens = rest.split(/\s+/).filter(Boolean).length;
  return Math.ceil(cjk * 1.5 + wordTokens);
}

function buildSectionPath(lawName: string, chapter?: string, section?: string): string {
  const parts = [lawName];
  if (chapter) parts.push(chapter.replace(/\s+/g, ''));
  if (section) parts.push(section.replace(/\s+/g, ''));
  return parts.join('/');
}

function chunkLaw(law: LawData): Chunk[] {
  const chunks: Chunk[] = [];
  const tags = LAW_TAGS[law.pcode] || ['law'];

  for (let i = 0; i < law.articles.length; i++) {
    const art = law.articles[i];
    const sectionPath = buildSectionPath(law.name, art.chapter, art.section);
    const articleLabel = `第${art.articleNo}條`;

    // 組合文字：章節 context + 條號 + 內容
    let text = '';
    const tokens = estimateTokens(art.content);

    // 如果條文太短 (< 50 tokens)，加上章節標題提供 context
    if (tokens < 50) {
      const ctx: string[] = [];
      if (art.chapter) ctx.push(art.chapter);
      if (art.section) ctx.push(art.section);
      text = `${law.name} ${ctx.join(' ')} ${articleLabel}\n${art.content}`;
    } else {
      text = `${law.name} ${articleLabel}\n${art.content}`;
    }

    chunks.push({
      chunkId: `${law.pcode}_art${art.articleNo.replace(/-/g, '_')}`,
      sourceId: law.pcode,
      sourceType: 'law',
      title: `${law.name} ${articleLabel}`,
      text,
      chunkNo: i + 1,
      sectionPath: `${sectionPath}/${articleLabel}`,
      articleNo: art.articleNo,
      language: 'zh-TW',
      tags,
      effectiveDate: law.effectiveDate,
      jurisdiction: 'TW',
      isActive: true,
    });
  }

  return chunks;
}

function main() {
  const lawsDir = path.join(process.cwd(), 'data', 'laws');
  const chunksDir = path.join(process.cwd(), 'data', 'chunks');
  fs.mkdirSync(chunksDir, { recursive: true });

  const files = fs.readdirSync(lawsDir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.error('❌ data/laws/ 中找不到 JSON 檔。請先執行 crawl-laws.ts');
    process.exit(1);
  }

  console.log('🔪 開始切塊法規...\n');

  let totalChunks = 0;
  const allChunks: Chunk[] = [];

  for (const file of files) {
    const fp = path.join(lawsDir, file);
    const law: LawData = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    const chunks = chunkLaw(law);
    totalChunks += chunks.length;
    allChunks.push(...chunks);

    // 統計 token 範圍
    const tokenCounts = chunks.map(c => estimateTokens(c.text));
    const minT = Math.min(...tokenCounts);
    const maxT = Math.max(...tokenCounts);
    const avgT = Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length);

    console.log(`  📄 ${law.name}: ${chunks.length} 塊 (tokens: min=${minT}, avg=${avgT}, max=${maxT})`);

    // 也把每部法的 chunks 獨立存一份
    const outFile = path.join(chunksDir, file);
    fs.writeFileSync(outFile, JSON.stringify(chunks, null, 2), 'utf-8');
  }

  // 存合併檔
  const allFile = path.join(chunksDir, '_all_chunks.json');
  fs.writeFileSync(allFile, JSON.stringify(allChunks, null, 2), 'utf-8');

  console.log(`\n✅ 完成！共 ${totalChunks} 塊，已存至 data/chunks/`);
  console.log(`   合併檔：${allFile}`);
}

main();
