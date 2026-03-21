import * as fs from "node:fs";
import * as path from "node:path";

interface LawAttachment {
  url: string;
  downloadName: string;
  localPath?: string;
}

interface LawArticle {
  articleNo: string;
  content: string;
  chapter?: string;
  section?: string;
  attachments?: LawAttachment[];
}

interface LawData {
  pcode: string;
  name: string;
  effectiveDate: string;
  url?: string;
  articles: LawArticle[];
}

interface WdaPolicy {
  id: string;
  title: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  content: string;
  attachments: Array<{ title: string; url: string }>;
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
  attachments: Array<{
    title: string;
    url: string;
    fileName: string;
    localPath: string;
    mimeType: string;
  }>;
  url: string;
}

interface AttachmentTextRecord {
  id: string;
  sourceId: string;
  sourceType: "attachment";
  title: string;
  text: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sourceUrl: string;
  effectiveDate: string;
  extractedAt: string;
}

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

const LAW_TAGS: Record<string, string[]> = {
  N0030001: ["labor", "employment", "wages", "working_hours", "termination"],
  N0030014: ["gender_equality", "sexual_harassment", "parental_leave"],
  N0030020: ["retirement", "pension", "labor_pension"],
  N0060001: ["occupational_safety", "workplace_health"],
  N0090001: ["employment_service", "foreign_worker", "work_permit"],
  N0090006: ["foreign_worker", "qualification", "hiring_standard"],
  N0090023: ["foreign_worker", "transfer", "continuation"],
  N0090027: ["mid_labor", "foreign_worker", "employment_management"],
  L0050018: ["health_check", "foreign_worker", "medical_management"],
};

function estimateTokens(text: string) {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const latin = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ").trim();
  const wordTokens = latin.split(/\s+/).filter(Boolean).length;
  return Math.ceil(cjk * 1.5 + wordTokens);
}

function readJsonFile<T>(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function readJsonFiles<T>(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    return [] as T[];
  }

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".json") && !file.startsWith("_"))
    .map((file) => readJsonFile<T>(path.join(dirPath, file)));
}

function splitText(text: string, targetTokenSize = 700) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (buffer && estimateTokens(candidate) > targetTokenSize) {
      chunks.push(buffer);
      buffer = paragraph;
      continue;
    }
    buffer = candidate;
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks.length > 0 ? chunks : [text];
}

function buildLawChunks(law: LawData) {
  return law.articles.map<RagChunk>((article, index) => {
    const articleLabel = `第 ${article.articleNo} 條`;
    const contextPath = [law.name, article.chapter, article.section, articleLabel]
      .filter(Boolean)
      .join(" / ");
    const attachmentText =
      article.attachments?.length
        ? `\n\n附件：\n${article.attachments
            .map((attachment) => `- ${attachment.downloadName}`)
            .join("\n")}`
        : "";

    return {
      chunkId: `${law.pcode}_art_${article.articleNo.replace(/-/g, "_")}`,
      sourceId: law.pcode,
      sourceType: "law",
      title: `${law.name} ${articleLabel}`,
      text: [law.name, articleLabel, article.content, attachmentText]
        .filter(Boolean)
        .join("\n")
        .trim(),
      chunkNo: index + 1,
      sectionPath: contextPath,
      articleNo: article.articleNo,
      language: "zh-TW",
      tags: LAW_TAGS[law.pcode] || ["law"],
      effectiveDate: law.effectiveDate,
      jurisdiction: "TW",
      isActive: true,
      sourceUrl:
        law.url || `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${law.pcode}`,
    };
  });
}

function buildPolicyChunks(policy: WdaPolicy) {
  const sections = splitText(policy.content);
  const attachmentText = policy.attachments.length
    ? `\n\n附件：\n${policy.attachments
        .map((attachment) => `- ${attachment.title}`)
        .join("\n")}`
    : "";

  return sections.map<RagChunk>((section, index) => ({
    chunkId: `${policy.id}_chunk_${index + 1}`,
    sourceId: policy.id,
    sourceType: "wda_policy",
    title: policy.title,
    text: [
      policy.title,
      `分類：${policy.category}`,
      `發布日期：${policy.publishedAt}`,
      `更新日期：${policy.updatedAt}`,
      "",
      section,
      index === sections.length - 1 ? attachmentText : "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim(),
    chunkNo: index + 1,
    sectionPath: `WDA / 政策法令 / ${policy.category} / ${policy.title}`,
    articleNo: `policy-${index + 1}`,
    language: "zh-TW",
    tags: ["wda", "policy", policy.category],
    effectiveDate: policy.updatedAt || policy.publishedAt,
    jurisdiction: "TW",
    isActive: true,
    sourceUrl: policy.url,
  }));
}

function buildFaqChunks(record: WdaFaqRecord) {
  const attachmentText = record.attachments.length
    ? `\n\n附件：\n${record.attachments
        .map((attachment) => `- ${attachment.fileName}`)
        .join("\n")}`
    : "";
  const rawText = [
    record.title,
    `分類：${record.sectionGroup}`,
    `頁面類型：${record.pageKind}`,
    record.content,
    record.tableText ? `表格：\n${record.tableText}` : "",
    attachmentText,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return splitText(rawText).map<RagChunk>((part, index) => ({
    chunkId: `${record.sourceId}_chunk_${index + 1}`,
    sourceId: record.sourceId,
    sourceType: "wda_faq",
    title: record.title,
    text: part,
    chunkNo: index + 1,
    sectionPath: [record.sectionGroup, ...record.breadcrumbs]
      .filter(Boolean)
      .join(" / "),
    articleNo: `faq-${index + 1}`,
    language: "zh-TW",
    tags: ["wda", "mid_labor", "faq", record.sectionGroup],
    effectiveDate: record.effectiveDate,
    jurisdiction: "TW",
    isActive: true,
    sourceUrl: record.url,
  }));
}

function buildAttachmentChunks(record: AttachmentTextRecord) {
  return splitText(record.text).map<RagChunk>((part, index) => ({
    chunkId: `${record.sourceId}_chunk_${index + 1}`,
    sourceId: record.sourceId,
    sourceType: "attachment",
    title: record.title,
    text: part,
    chunkNo: index + 1,
    sectionPath: `附件 / ${record.fileName}`,
    articleNo: `attachment-${index + 1}`,
    language: "zh-TW",
    tags: ["attachment", "pdf"],
    effectiveDate: record.effectiveDate,
    jurisdiction: "TW",
    isActive: true,
    sourceUrl: record.sourceUrl,
  }));
}

function main() {
  const outputDir = path.join(process.cwd(), "data", "chunks");
  const lawsDir = path.join(process.cwd(), "data", "laws");
  const policiesDir = path.join(process.cwd(), "data", "wda_policies");
  const faqManifest = path.join(
    process.cwd(),
    "data",
    "wda_faq",
    "wda_mid_labor_pages.json"
  );
  const attachmentTextsDir = path.join(
    process.cwd(),
    "data",
    "attachment_texts"
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const laws = readJsonFiles<LawData>(lawsDir);
  const policies = readJsonFiles<WdaPolicy>(policiesDir);
  const faqRecords = fs.existsSync(faqManifest)
    ? readJsonFile<WdaFaqRecord[]>(faqManifest)
    : [];
  const attachmentTexts = readJsonFiles<AttachmentTextRecord>(attachmentTextsDir);

  const allChunks: RagChunk[] = [];

  for (const law of laws) {
    const chunks = buildLawChunks(law);
    allChunks.push(...chunks);
    fs.writeFileSync(
      path.join(outputDir, `${law.pcode}.json`),
      JSON.stringify(chunks, null, 2),
      "utf-8"
    );
  }

  for (const policy of policies) {
    const chunks = buildPolicyChunks(policy);
    allChunks.push(...chunks);
    fs.writeFileSync(
      path.join(outputDir, `${policy.id}.json`),
      JSON.stringify(chunks, null, 2),
      "utf-8"
    );
  }

  if (faqRecords.length > 0) {
    const chunks = faqRecords.flatMap((record) => buildFaqChunks(record));
    allChunks.push(...chunks);
    fs.writeFileSync(
      path.join(outputDir, "wda_faq_chunks.json"),
      JSON.stringify(chunks, null, 2),
      "utf-8"
    );
  }

  if (attachmentTexts.length > 0) {
    const chunks = attachmentTexts.flatMap((record) => buildAttachmentChunks(record));
    allChunks.push(...chunks);
    fs.writeFileSync(
      path.join(outputDir, "attachment_chunks.json"),
      JSON.stringify(chunks, null, 2),
      "utf-8"
    );
  }

  fs.writeFileSync(
    path.join(outputDir, "_all_chunks.json"),
    JSON.stringify(allChunks, null, 2),
    "utf-8"
  );

  console.log(
    [
      `Built ${allChunks.length} RAG chunks.`,
      `laws=${laws.length}`,
      `wdaPolicies=${policies.length}`,
      `wdaFaqPages=${faqRecords.length}`,
      `attachments=${attachmentTexts.length}`,
    ].join(" ")
  );
}

main();
