import * as fs from "node:fs";
import * as path from "node:path";

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
  articles: LawArticle[];
}

interface WdaPolicy {
  id: string;
  title: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  content: string;
  attachments: { title: string; url: string }[];
  url: string;
}

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

const LAW_TAGS: Record<string, string[]> = {
  N0030001: ["labor", "employment", "wages", "working_hours", "termination"],
  N0090001: ["employment_service", "foreign_worker", "work_permit"],
  N0090006: ["foreign_worker", "qualification", "hiring_standard"],
  N0030020: ["retirement", "pension", "labor_pension"],
  N0060001: ["occupational_safety", "workplace_health"],
  N0030014: ["gender_equality", "sexual_harassment", "parental_leave"],
};

function estimateTokens(text: string) {
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)?.length ?? 0;
  const rest = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, " ").trim();
  const wordTokens = rest.split(/\s+/).filter(Boolean).length;
  return Math.ceil(cjk * 1.5 + wordTokens);
}

function readJsonFiles<T>(dirPath: string) {
  if (!fs.existsSync(dirPath)) return [] as T[];

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.endsWith(".json") && !file.startsWith("_"))
    .map((file) =>
      JSON.parse(fs.readFileSync(path.join(dirPath, file), "utf-8")) as T
    );
}

function buildLawChunks(law: LawData): RagChunk[] {
  return law.articles.map((article, index) => {
    const articleLabel = `第 ${article.articleNo} 條`;
    const context = [article.chapter, article.section].filter(Boolean).join(" / ");
    const compactTitle = context ? `${law.name} ${context}` : law.name;
    const content =
      estimateTokens(article.content) < 50
        ? `${compactTitle}\n${articleLabel}\n${article.content}`
        : `${law.name}\n${articleLabel}\n${article.content}`;

    return {
      chunkId: `${law.pcode}_art_${article.articleNo.replace(/-/g, "_")}`,
      sourceId: law.pcode,
      sourceType: "law",
      title: `${law.name} ${articleLabel}`,
      text: content.trim(),
      chunkNo: index + 1,
      sectionPath: [law.name, article.chapter, article.section, articleLabel]
        .filter(Boolean)
        .join(" / "),
      articleNo: article.articleNo,
      language: "zh-TW",
      tags: LAW_TAGS[law.pcode] || ["law"],
      effectiveDate: law.effectiveDate,
      jurisdiction: "TW",
      isActive: true,
      sourceUrl: `https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=${law.pcode}`,
    };
  });
}

function splitPolicyContent(policy: WdaPolicy) {
  const paragraphs = policy.content
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n${paragraph}` : paragraph;

    if (buffer && estimateTokens(candidate) > 700) {
      chunks.push(buffer);
      buffer = paragraph;
      continue;
    }

    buffer = candidate;
  }

  if (buffer) {
    chunks.push(buffer);
  }

  return chunks.length > 0 ? chunks : [policy.content];
}

function buildPolicyChunks(policy: WdaPolicy): RagChunk[] {
  const sections = splitPolicyContent(policy);
  const baseTags = ["wda", "policy", policy.category];
  const attachmentText = policy.attachments.length
    ? `\n\n附件：\n${policy.attachments.map((file) => `- ${file.title}`).join("\n")}`
    : "";

  return sections.map((section, index) => ({
    chunkId: `${policy.id}_chunk_${index + 1}`,
    sourceId: policy.id,
    sourceType: "wda_policy",
    title: policy.title,
    text: [
      policy.title,
      `類別：${policy.category}`,
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
    sectionPath: `政策法令 / ${policy.category} / ${policy.title}`,
    articleNo: `policy-${index + 1}`,
    language: "zh-TW",
    tags: baseTags,
    effectiveDate: policy.updatedAt || policy.publishedAt,
    jurisdiction: "TW",
    isActive: true,
    sourceUrl: policy.url,
  }));
}

function main() {
  const outputDir = path.join(process.cwd(), "data", "chunks");
  fs.mkdirSync(outputDir, { recursive: true });

  const laws = readJsonFiles<LawData>(path.join(process.cwd(), "data", "laws"));
  const policies = readJsonFiles<WdaPolicy>(
    path.join(process.cwd(), "data", "wda_policies")
  );

  const allChunks: RagChunk[] = [];

  for (const law of laws) {
    const lawChunks = buildLawChunks(law);
    allChunks.push(...lawChunks);
    fs.writeFileSync(
      path.join(outputDir, `${law.pcode}.json`),
      JSON.stringify(lawChunks, null, 2),
      "utf-8"
    );
  }

  for (const policy of policies) {
    const policyChunks = buildPolicyChunks(policy);
    allChunks.push(...policyChunks);
    fs.writeFileSync(
      path.join(outputDir, `${policy.id}.json`),
      JSON.stringify(policyChunks, null, 2),
      "utf-8"
    );
  }

  fs.writeFileSync(
    path.join(outputDir, "_all_chunks.json"),
    JSON.stringify(allChunks, null, 2),
    "utf-8"
  );

  console.log(
    `Built ${allChunks.length} RAG chunks from ${laws.length} laws and ${policies.length} WDA policies.`
  );
}

main();
