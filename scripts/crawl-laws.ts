/**
 * 法規爬蟲腳本 — 從全國法規資料庫 (law.moj.gov.tw) 爬取指定法規全文
 * 用法: npx tsx scripts/crawl-laws.ts
 */
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// ── 目標法規 ──
const TARGET_LAWS = [
  { pcode: 'N0030001', name: '勞動基準法' },
  { pcode: 'N0090001', name: '就業服務法' },
  { pcode: 'N0090006', name: '外國人從事就業服務法第四十六條第一項第八款至第十一款工作資格及審查標準' },
  { pcode: 'N0030020', name: '勞工退休金條例' },
  { pcode: 'N0060001', name: '職業安全衛生法' },
  { pcode: 'N0030014', name: '性別平等工作法' },
  { pcode: 'N0090027', name: '雇主聘僱外國人許可及管理辦法' },
  { pcode: 'L0050018', name: '受聘僱外國人健康檢查管理辦法' },
  { pcode: 'N0090023', name: '外國人受聘僱從事就業服務法第四十六條第一項第八款至第十一款規定工作之轉換雇主或工作程序準則' },
];

interface LawArticle {
  articleNo: string;
  content: string;
  chapter?: string;
  section?: string;
  attachments?: LawAttachment[];
}

interface LawAttachment {
  url: string;
  downloadName: string;
  localPath?: string;
}

interface LawData {
  pcode: string;
  name: string;
  effectiveDate: string;
  crawledAt: string;
  url: string;
  chapters: string[];
  articles: LawArticle[];
  totalArticles: number;
}

async function fetchPage(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.warn(`  ⚠ Attempt ${i + 1} failed: ${err}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      else throw err;
    }
  }
  throw new Error('unreachable');
}

/**
 * HTML 結構 (law.moj.gov.tw/LawClass/LawAll.aspx):
 *   章節標題: <div class="h3 char-2">   第 一 章 總則</div>
 *   條文列:   <div class="row">
 *               <div class="col-no"><a name="1">第 1 條</a></div>
 *               <div class="col-data">
 *                 <div class="law-article">
 *                   <div class="line-0000">條文內容...</div>
 *                   <div class="line-0004">一、...</div>
 *                 </div>
 *               </div>
 *             </div>
 *   修正日期: <tr id="trLNNDate"><th>修正日期：</th><td>民國 113 年 07 月 31 日</td></tr>
 */
function parseLawHTML(html: string, pcode: string, expectedName: string): LawData {
  const $ = cheerio.load(html);
  const url = `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${pcode}`;

  // ── 法規名稱 ──
  const lawName = $('#hlLawName').text().trim() || expectedName;

  // ── 修正日期 ──
  let effectiveDate = '';
  const dateText = $('#trLNNDate td').text().trim(); // "民國 113 年 07 月 31 日"
  const dm = dateText.match(/民國\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (dm) {
    const y = parseInt(dm[1]) + 1911;
    effectiveDate = `${y}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
  }

  // ── 章節 & 條文 ──
  const articles: LawArticle[] = [];
  const chapters: string[] = [];
  let currentChapter = '';
  let currentSection = '';

  // 遍歷 law-reg-content 下的所有直接子元素
  const container = $('div.law-reg-content');
  container.children().each((_, el) => {
    const $el = $(el);

    // 章節標題
    if ($el.hasClass('h3') && $el.hasClass('char-2')) {
      const text = $el.text().trim().replace(/\s+/g, ' ');
      // 判斷是章還是節
      if (/第\s*[一二三四五六七八九十百零\d]+\s*節/.test(text)) {
        currentSection = text;
      } else {
        currentChapter = text;
        currentSection = '';
        if (!chapters.includes(currentChapter)) chapters.push(currentChapter);
      }
      return;
    }

    // 條文列 (div.row)
    if ($el.hasClass('row')) {
      const colNo = $el.find('div.col-no a').first();
      const articleName = colNo.attr('name'); // e.g. "1", "9-1", "84-1"
      if (!articleName) return;

      const articleNo = articleName;

      // 取得條文內容 — 合併所有 line-* div 的文字
      const lawArticle = $el.find('div.law-article');
      const lines: string[] = [];
      lawArticle.find('div[class^="line-"]').each((_, lineEl) => {
        lines.push($(lineEl).text().trim());
      });
      const content = lines.join('\n');
      
      const attachments: LawAttachment[] = [];
      // Catch attachment links
      lawArticle.find('a[href*="LawGetFile.ashx"], a[href*="getfile.ashx"]').each((_, aEl) => {
        const href = $(aEl).attr('href');
        const text = $(aEl).text().trim();
        if (href) {
          const absoluteUrl = new URL(href, url).href;
          attachments.push({
            url: absoluteUrl,
            downloadName: `${pcode}_${articleName}_${text}`.replace(/[\\/:*?"<>|]/g, '_')
          });
        }
      });

      if (content) {
        articles.push({
          articleNo,
          content,
          ...(currentChapter ? { chapter: currentChapter } : {}),
          ...(currentSection ? { section: currentSection } : {}),
          ...(attachments.length > 0 ? { attachments } : {})
        });
      }
    }
  });

  return {
    pcode,
    name: lawName,
    effectiveDate,
    crawledAt: new Date().toISOString(),
    url,
    chapters,
    articles,
    totalArticles: articles.length,
  };
}

async function crawlLaw(pcode: string, expectedName: string): Promise<LawData> {
  const url = `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${pcode}`;
  console.log(`\n📥 爬取: ${expectedName} (${pcode})`);
  const html = await fetchPage(url);
  const data = parseLawHTML(html, pcode, expectedName);
  console.log(`  ✅ ${data.name}: ${data.totalArticles} 條, ${data.chapters.length} 章, 修正日期 ${data.effectiveDate || '(未知)'}`);
  
  const ragusedir = path.join(process.cwd(), 'raguse');
  if(!fs.existsSync(ragusedir)) fs.mkdirSync(ragusedir, {recursive: true});
  
  for (const article of data.articles) {
    if (article.attachments) {
      for (const att of article.attachments) {
        try {
          console.log(`    ⬇ 下載附件: ${att.downloadName}`);
          const res = await fetch(att.url);
          if(!res.ok) throw new Error(`HTTP ${res.status}`);
          
          let ext = '.pdf';
          const cd = res.headers.get('content-disposition') || '';
          if (cd.includes('.doc')) ext = '.doc';
          if (cd.includes('.docx')) ext = '.docx';
          if (cd.includes('.xls')) ext = '.xls';
          if (cd.includes('.xlsx')) ext = '.xlsx';
          if (cd.includes('.odt')) ext = '.odt';
          
          const finalFilename = att.downloadName + ext;
          const destPath = path.join(ragusedir, finalFilename);
          att.localPath = destPath;
          
          const buffer = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
          
          article.content += `\n\n[此條文含有附件，已自動下載儲存為：${finalFilename}]`;
          
          await new Promise(r => setTimeout(r, 800)); // Be nice to the server
        } catch(e) {
          console.warn(`    ⚠ 下載附件失敗 ${att.downloadName}: ${e}`);
        }
      }
    }
  }

  return data;
}

async function main() {
  const outDir = path.join(process.cwd(), 'data', 'laws');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('🚀 開始爬取台灣法規...');
  console.log(`📁 輸出: ${outDir}\n`);

  const results: { name: string; articles: number; ok: boolean }[] = [];

  for (const law of TARGET_LAWS) {
    try {
      const data = await crawlLaw(law.pcode, law.name);
      const fp = path.join(outDir, `${law.pcode}.json`);
      fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`  💾 ${law.pcode}.json`);
      results.push({ name: law.name, articles: data.totalArticles, ok: true });
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`  ❌ ${law.name}: ${err}`);
      results.push({ name: law.name, articles: 0, ok: false });
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 結果：');
  for (const r of results) console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}: ${r.articles} 條`);
  const total = results.reduce((s, r) => s + r.articles, 0);
  console.log(`\n  合計: ${results.filter(r => r.ok).length}/${results.length} 部法規, ${total} 條`);
}

main().catch(console.error);
