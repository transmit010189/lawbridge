import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

const ROOT_URL =
  "https://fw.wda.gov.tw/wda-employer/home/mid-foreign-labor?locale=zh";
const SITE_ORIGIN = "https://fw.wda.gov.tw";
const OUTPUT_DIR = path.join(process.cwd(), "data", "wda_faq");
const MANIFEST_FILE = path.join(OUTPUT_DIR, "wda_mid_labor_pages.json");
const CHUNK_FILE = path.join(
  process.cwd(),
  "data",
  "chunks",
  "wda_faq_chunks.json"
);
const RAGUSE_DIR = path.join(process.cwd(), "raguse");
const MAX_CHARS_PER_CHUNK = 1800;

const TARGET_SECTIONS = new Set([
  "最新消息",
  "法規",
  "申請流程及須知",
  "專業證照",
  "訓練課程",
  "實作認定",
  "申請文件下載",
  "線上申辦/進度查詢",
  "移工在職進修",
  "問與答QA",
]);

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
};

interface AttachmentRecord {
  title: string;
  url: string;
  fileName: string;
  localPath: string;
  mimeType: string;
}

interface CrawlSeed {
  sectionGroup: string;
  title: string;
  url: string;
}

interface WdaFaqRecord {
  id: string;
  sourceId: string;
  sourceType: "wda_faq";
  sectionGroup: string;
  title: string;
  breadcrumbs: string[];
  pageKind: "detail" | "listing" | "download";
  content: string;
  tableText: string;
  publishedAt: string;
  updatedAt: string;
  effectiveDate: string;
  attachments: AttachmentRecord[];
  url: string;
  crawledAt: string;
}

interface RagChunk {
  chunkId: string;
  sourceId: string;
  sourceType: "wda_faq";
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

interface ParsedAccordionItem {
  title: string;
  breadcrumbs: string[];
  content: string;
  tableText: string;
  attachments: AttachmentRecord[];
  publishedAt: string;
  updatedAt: string;
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function sanitizeFileSegment(value: string) {
  const sanitized = value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.slice(0, 120) || "attachment";
}

function stableId(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function toAbsoluteUrl(href?: string) {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return `${SITE_ORIGIN}${href}`;
}

function stripWindowMarker(value: string) {
  return normalizeText(
    value
      .replace(/•?\s*\[另開視窗\]/g, "")
      .replace(/•?\s*\[另開新視窗\]/g, "")
      .replace(/^連結至$/g, "")
  );
}

function extractLinkLabel(element: cheerio.Cheerio<AnyNode>) {
  const candidates = [
    stripWindowMarker(element.text()),
    stripWindowMarker(element.attr("title") || ""),
    stripWindowMarker(element.find("img").attr("alt") || ""),
    stripWindowMarker(element.find("p").text()),
  ];

  return candidates.find(Boolean) || "附件";
}

function extractImageLabel(element: cheerio.Cheerio<AnyNode>) {
  const candidates = [
    stripWindowMarker(element.attr("alt") || ""),
    stripWindowMarker(element.attr("title") || ""),
    stripWindowMarker(element.parent("a").attr("title") || ""),
    stripWindowMarker(element.parent("figure").find("figcaption").text()),
    stripWindowMarker(element.closest("figure").find("figcaption").text()),
  ];

  return candidates.find(Boolean) || "圖卡";
}

function getContentSection($: cheerio.CheerioAPI) {
  const selectors = [
    "#content section.col-lg-9",
    "main section.col-lg-9",
    "section.col-lg-9",
    "main",
    "article",
    ".page-middle",
    ".middle-content",
    ".content",
    "body",
  ];

  for (const selector of selectors) {
    const node = $(selector).first();
    if (node.length > 0) {
      return node;
    }
  }

  return $("body");
}

async function fetchHtml(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} when fetching ${url}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function resolveExtension(
  url: string,
  contentType: string,
  contentDisposition: string
) {
  const dispositionMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  const urlPath = new URL(url).pathname;
  const dispositionExtension = dispositionMatch
    ? path.extname(dispositionMatch[1])
    : "";
  const urlExtension = path.extname(urlPath);

  if (dispositionExtension) return dispositionExtension;
  if (urlExtension) return urlExtension;

  const typeMap: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.oasis.opendocument.text": ".odt",
  };

  return typeMap[contentType] || "";
}

async function downloadAttachment(
  url: string,
  sectionGroup: string,
  pageTitle: string,
  linkTitle: string
) {
  let response: Response | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      response = await fetch(url, { headers: REQUEST_HEADERS });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} when downloading ${url}`);
      }
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  if (!response) {
    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to download ${url}`);
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim() ||
    "application/octet-stream";
  const extension = resolveExtension(
    url,
    contentType,
    response.headers.get("content-disposition") || ""
  );
  const label = sanitizeFileSegment(linkTitle || pageTitle);
  const finalFileName = `WDA_${sanitizeFileSegment(
    sectionGroup
  )}_${label}_${stableId(url)}${extension}`;
  const localPath = path.join(RAGUSE_DIR, finalFileName);

  if (!fs.existsSync(localPath)) {
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(localPath, buffer);
  }

  return {
    title: linkTitle || pageTitle,
    url,
    fileName: finalFileName,
    localPath,
    mimeType: contentType,
  } satisfies AttachmentRecord;
}

function tableToMarkdown(table: cheerio.Cheerio<AnyNode>, $: cheerio.CheerioAPI) {
  const rows: string[][] = [];

  table.find("tr").each((_, row) => {
    const cells: string[] = [];

    $(row)
      .find("th,td")
      .each((__, cell) => {
        const value = normalizeText($(cell).text());
        if (value) {
          cells.push(value);
        }
      });

    if (cells.length > 0) {
      rows.push(cells);
    }
  });

  if (rows.length === 0) {
    return "";
  }

  const header = rows[0];
  const body = rows.slice(1);
  const separator = header.map(() => "---");

  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((cells) => `| ${cells.join(" | ")} |`),
  ].join("\n");
}

function extractTables(root: cheerio.Cheerio<AnyNode>, $: cheerio.CheerioAPI) {
  const tables = root
    .find("table")
    .map((_, table) => tableToMarkdown($(table), $))
    .get()
    .filter(Boolean);

  return tables.join("\n\n");
}

function extractText(root: cheerio.Cheerio<AnyNode>, $: cheerio.CheerioAPI) {
  const clone = root.clone();
  clone
    .find(
      "script, style, nav, footer, form, button, input, select, label, .text-title, .input-group, .pagination, .con_footer, table, ul.list-inline"
    )
    .remove();
  clone.find("br").replaceWith("\n");
  clone.find("li").each((_, item) => {
    const line = normalizeText($(item).text());
    if (line) {
      $(item).text(`- ${line}`);
    }
  });

  return normalizeText(clone.text());
}

function extractMetaDate(value: string) {
  const match = value.match(/(\d{4}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2})/);
  return match ? match[1].replace(/\//g, "-") : "";
}

function extractMetaDateFromNode(
  root: cheerio.Cheerio<AnyNode>,
  $: cheerio.CheerioAPI,
  label: string
) {
  const values = root
    .find("li, span, p, div")
    .map((_, el) => normalizeText($(el).text()))
    .get()
    .filter((text) => text.includes(label));

  return extractMetaDate(values[0] || "");
}

function isDownloadUrl(url: string) {
  return (
    /\/download-file\//.test(url) ||
    /\.(pdf|doc|docx|odt|xls|xlsx|csv|ppt|pptx|jpg|jpeg|png|webp)$/i.test(url)
  );
}

function isInlineAssetUrl(url: string) {
  if (!url || url.startsWith("data:")) {
    return false;
  }

  return (
    isDownloadUrl(url) ||
    /\.(gif|bmp)$/i.test(url) ||
    /\/uploads?\//i.test(url) ||
    /[?&](file|download|attachment)=/i.test(url)
  );
}

function shouldCaptureInlineImage(element: cheerio.Cheerio<AnyNode>) {
  const src = toAbsoluteUrl(element.attr("src"));
  if (!src || src.startsWith("data:") || /\.svg($|\?)/i.test(src)) {
    return false;
  }

  const classes = `${element.attr("class") || ""} ${element.parent().attr("class") || ""}`;
  if (/\b(icon|logo|avatar|breadcrumb|arrow)\b/i.test(classes)) {
    return false;
  }

  const width = Number(element.attr("width") || 0);
  const height = Number(element.attr("height") || 0);
  if ((width > 0 && width < 120) || (height > 0 && height < 120)) {
    return false;
  }

  const textContext = normalizeText(
    element.closest("figure, div, p, li, section").first().text()
  );

  return isInlineAssetUrl(src) || textContext.length > 24;
}

function collectRootSeeds(rootHtml: string) {
  const $ = cheerio.load(rootHtml);
  const seeds: CrawlSeed[] = [];
  const seen = new Set<string>();

  $("aside .accordion-item").each((_, item) => {
    const sectionGroup = normalizeText($(item).find(".accordion-header h4").first().text());
    if (!TARGET_SECTIONS.has(sectionGroup)) {
      return;
    }

    $(item)
      .find(".accordion-body a.list-group-item")
      .each((__, link) => {
        const title = normalizeText($(link).text());
        const url = toAbsoluteUrl($(link).attr("href"));

        if (!title || !url || url === ROOT_URL) {
          return;
        }

        const key = `${sectionGroup}::${url}`;
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        seeds.push({
          sectionGroup,
          title,
          url,
        });
      });
  });

  return seeds;
}

async function collectAttachments(
  root: cheerio.Cheerio<AnyNode>,
  $: cheerio.CheerioAPI,
  sectionGroup: string,
  pageTitle: string
) {
  const attachments: AttachmentRecord[] = [];
  const seen = new Set<string>();

  const links = root.find("a[href]");
  for (let index = 0; index < links.length; index += 1) {
    const element = links.eq(index);
    const url = toAbsoluteUrl(element.attr("href"));
    if (!url || !isDownloadUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    const title = extractLinkLabel(element) || pageTitle;
    attachments.push(
      await downloadAttachment(url, sectionGroup, pageTitle, title)
    );
  }

  const embeddedAssets = root.find("iframe[src], embed[src], object[data]");
  for (let index = 0; index < embeddedAssets.length; index += 1) {
    const element = embeddedAssets.eq(index);
    const url = toAbsoluteUrl(
      element.attr("src") || element.attr("data") || ""
    );
    if (!url || !isInlineAssetUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    const title =
      stripWindowMarker(element.attr("title") || "") || `${pageTitle} 內嵌附件`;
    attachments.push(
      await downloadAttachment(url, sectionGroup, pageTitle, title)
    );
  }

  const images = root.find("img[src]");
  for (let index = 0; index < images.length; index += 1) {
    const element = images.eq(index);
    const url = toAbsoluteUrl(element.attr("src"));
    if (!url || seen.has(url) || !shouldCaptureInlineImage(element)) {
      continue;
    }

    seen.add(url);
    const title = extractImageLabel(element) || `${pageTitle} 圖卡`;
    attachments.push(
      await downloadAttachment(url, sectionGroup, pageTitle, title)
    );
  }

  return attachments;
}

function collectExternalLinks(
  root: cheerio.Cheerio<AnyNode>,
  $: cheerio.CheerioAPI,
  currentUrl: string
) {
  const seen = new Set<string>();

  return root
    .find("a[href]")
    .map((_, link) => {
      const element = $(link);
      const url = toAbsoluteUrl(element.attr("href"));
      if (!url || url === currentUrl || isDownloadUrl(url) || seen.has(url)) {
        return null;
      }

      seen.add(url);
      const label = extractLinkLabel(element);
      if (!label && !url) {
        return null;
      }

      return `${label}: ${url}`;
    })
    .get()
    .filter((item): item is string => Boolean(item));
}

function splitTitleHierarchy(rawTitle: string, fallbackTitle: string) {
  const parts = rawTitle
    .split(">")
    .map((part) => normalizeText(part))
    .filter(Boolean);

  if (parts.length > 1) {
    return {
      title: parts[parts.length - 1],
      breadcrumbs: parts.slice(0, -1),
    };
  }

  return {
    title: rawTitle || fallbackTitle,
    breadcrumbs:
      fallbackTitle && fallbackTitle !== rawTitle ? [fallbackTitle] : [],
  };
}

function splitIntoChunks(text: string, maxChars: number) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (buffer && candidate.length > maxChars) {
      chunks.push(buffer);
      buffer = paragraph;
      continue;
    }
    buffer = candidate;
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks;
}

function buildChunks(records: WdaFaqRecord[]) {
  const chunks: RagChunk[] = [];

  for (const record of records) {
    const attachmentLines = record.attachments.length
      ? [
          "附件：",
          ...record.attachments.map((item) => `- ${item.fileName}`),
        ].join("\n")
      : "";

    const fullText = [
      record.title,
      `分類：${record.sectionGroup}`,
      `頁面類型：${record.pageKind}`,
      record.content,
      record.tableText ? `表格：\n${record.tableText}` : "",
      attachmentLines,
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (!fullText) {
      continue;
    }

    const parts = splitIntoChunks(fullText, MAX_CHARS_PER_CHUNK);
    const sectionPath = [record.sectionGroup, ...record.breadcrumbs]
      .filter(Boolean)
      .join(" / ");

    parts.forEach((part, index) => {
      chunks.push({
        chunkId: `${record.sourceId}_chunk_${index + 1}`,
        sourceId: record.sourceId,
        sourceType: "wda_faq",
        title: record.title,
        text: part,
        chunkNo: index + 1,
        sectionPath,
        articleNo: `faq-${index + 1}`,
        language: "zh-TW",
        tags: ["wda", "mid-labor", record.sectionGroup, "faq"],
        effectiveDate: record.effectiveDate,
        jurisdiction: "TW",
        isActive: true,
        sourceUrl: record.url,
      });
    });
  }

  return chunks;
}

async function parseAccordionItems(
  seed: CrawlSeed,
  $: cheerio.CheerioAPI,
  section: cheerio.Cheerio<AnyNode>
) {
  const items = section.find(".accordion-item.border.blueborder.shadow.mb-3");
  const parsed: ParsedAccordionItem[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items.eq(index);
    const rawTitle = normalizeText(
      item.find(".accordion-header .h5, .accordion-header span.h5, .accordion-header h5").first().text()
    );

    const { title, breadcrumbs } = splitTitleHierarchy(rawTitle, seed.title);
    const body = item.find(".accordion-body").first();
    const contentBlocks = body
      .find(".text-con")
      .map((_, node) => extractText($(node), $))
      .get()
      .filter(Boolean);
    const tableText = extractTables(body, $);
    const externalLinks = collectExternalLinks(body, $, seed.url);
    const content = normalizeText(
      [
        ...contentBlocks,
        externalLinks.length
          ? ["相關連結：", ...externalLinks.map((link) => `- ${link}`)].join("\n")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    );
    const attachments = await collectAttachments(
      body,
      $,
      seed.sectionGroup,
      title
    );

    if (!content && !tableText && attachments.length === 0) {
      continue;
    }

    parsed.push({
      title,
      breadcrumbs,
      content,
      tableText,
      attachments,
      publishedAt: extractMetaDateFromNode(body, $, "發佈日期"),
      updatedAt: extractMetaDateFromNode(body, $, "更新日期"),
    });
  }

  return parsed;
}

async function crawlSeed(seed: CrawlSeed): Promise<WdaFaqRecord[]> {
  const html = await fetchHtml(seed.url);
  const $ = cheerio.load(html);
  const section = getContentSection($);
  const crawledAt = new Date().toISOString();
  const pageRecords: WdaFaqRecord[] = [];
  const accordionItems = await parseAccordionItems(seed, $, section);

  if (accordionItems.length > 0) {
    for (const item of accordionItems) {
      const sourceId = `wda_mid_labor_${stableId(`${seed.url}#${item.title}`)}`;
      pageRecords.push({
        id: sourceId,
        sourceId,
        sourceType: "wda_faq",
        sectionGroup: seed.sectionGroup,
        title: item.title,
        breadcrumbs: item.breadcrumbs,
        pageKind: "detail",
        content: item.content,
        tableText: item.tableText,
        publishedAt: item.publishedAt,
        updatedAt: item.updatedAt,
        effectiveDate:
          item.updatedAt || item.publishedAt || new Date().toISOString().slice(0, 10),
        attachments: item.attachments,
        url: seed.url,
        crawledAt,
      });
    }

    return pageRecords;
  }

  const fallbackTitle =
    normalizeText(
      section.find("h1, h2.srhTitle, h2, .page-title, .text-title").first().text()
    ) || seed.title;
  const fallbackContent = extractText(section, $);
  const fallbackTableText = extractTables(section, $);
  const externalLinks = collectExternalLinks(section, $, seed.url);
  const content = normalizeText(
    [
      fallbackContent,
      externalLinks.length
        ? ["相關連結：", ...externalLinks.map((link) => `- ${link}`)].join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n\n")
  );
  const attachments = await collectAttachments(
    section,
    $,
    seed.sectionGroup,
    fallbackTitle
  );
  const sourceId = `wda_mid_labor_${stableId(seed.url)}`;

  return [
    {
      id: sourceId,
      sourceId,
      sourceType: "wda_faq",
      sectionGroup: seed.sectionGroup,
      title: fallbackTitle,
      breadcrumbs: seed.title !== fallbackTitle ? [seed.title] : [],
      pageKind: attachments.length > 0 && !content ? "download" : "detail",
      content,
      tableText: fallbackTableText,
      publishedAt: extractMetaDateFromNode(section, $, "發佈日期"),
      updatedAt: extractMetaDateFromNode(section, $, "更新日期"),
      effectiveDate:
        extractMetaDateFromNode(section, $, "更新日期") ||
        extractMetaDateFromNode(section, $, "發佈日期") ||
        new Date().toISOString().slice(0, 10),
      attachments,
      url: seed.url,
      crawledAt,
    } satisfies WdaFaqRecord,
  ];
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CHUNK_FILE), { recursive: true });
  fs.mkdirSync(RAGUSE_DIR, { recursive: true });

  const rootHtml = await fetchHtml(ROOT_URL);
  const seeds = collectRootSeeds(rootHtml);
  const records: WdaFaqRecord[] = [];

  console.log(`Found ${seeds.length} WDA mid-labor entry links from root page.`);

  for (const seed of seeds) {
    console.log(`Crawling [${seed.sectionGroup}] ${seed.title}`);
    try {
      const seedRecords = await crawlSeed(seed);
      records.push(...seedRecords);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      console.error(`Failed to crawl ${seed.title}:`, error);
    }
  }

  const uniqueRecords = Array.from(
    new Map(
      records.map((record) => [`${record.url}::${record.title}`, record])
    ).values()
  ).sort((left, right) => {
    const sectionOrder = `${left.sectionGroup} ${left.title}`.localeCompare(
      `${right.sectionGroup} ${right.title}`,
      "zh-Hant"
    );
    return sectionOrder;
  });
  const chunks = buildChunks(uniqueRecords);

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(uniqueRecords, null, 2), "utf-8");
  fs.writeFileSync(CHUNK_FILE, JSON.stringify(chunks, null, 2), "utf-8");

  console.log(`Saved ${uniqueRecords.length} WDA page records to ${MANIFEST_FILE}`);
  console.log(`Saved ${chunks.length} WDA FAQ chunks to ${CHUNK_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
