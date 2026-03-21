import * as dotenv from "dotenv";
import * as cheerio from "cheerio";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  GEMINI_ATTACHMENT_EXTRACTION_MODEL,
  GEMINI_CHAT_MODEL,
} from "../src/lib/ai/geminiModels";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const RAGUSE_DIR = path.join(process.cwd(), "raguse");
const OUTPUT_DIR = path.join(process.cwd(), "data", "attachment_texts");
const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".docx",
  ".odt",
]);

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

function buildAttachmentId(value: string) {
  const asciiBase =
    value
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[^\x00-\x7F]+/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 48) || "file";
  const hash = crypto.createHash("sha1").update(value).digest("hex").slice(0, 12);
  return `attachment_${asciiBase}_${hash}`;
}

function attachmentNameScore(fileName: string) {
  let score = 0;

  if (!/[：:]/.test(fileName)) score += 8;
  if (!/•?\[另開視窗\]/.test(fileName)) score += 6;
  if (!/(內容|附件|圖片|連結)\s*[：:]/.test(fileName)) score += 4;
  if (/問與答QA|專業證照|訓練課程|實作認定|健康檢查|薪資|流程/.test(fileName)) {
    score += 5;
  }

  return score;
}

function detectMimeType(filePath: string, buffer: Buffer) {
  const signature = buffer.subarray(0, 16).toString("hex").toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  if (signature.startsWith("25504446")) {
    return "application/pdf";
  }

  if (signature.startsWith("ffd8ff")) {
    return "image/jpeg";
  }

  if (signature.startsWith("89504e47")) {
    return "image/png";
  }

  if (buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    const riffType = buffer.subarray(8, 12).toString("ascii");
    if (riffType === "WEBP") {
      return "image/webp";
    }
  }

  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (ext === ".odt") {
    return "application/vnd.oasis.opendocument.text";
  }

  return "application/octet-stream";
}

async function callGeminiExtraction(filePath: string, mimeType: string, prompt: string) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const data = fs.readFileSync(filePath).toString("base64");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${GEMINI_ATTACHMENT_EXTRACTION_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Attachment extraction error ${response.status}: ${await response.text()}`
    );
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Attachment extraction returned empty text.");
  }

  return text;
}

async function extractPdfText(filePath: string) {
  return callGeminiExtraction(
    filePath,
    "application/pdf",
    [
      "你正在把官方附件整理成法律 RAG 資料。",
      "請完整抽取 PDF 文字，保留標題、條文、表格、附表、欄位名稱與重要備註。",
      "輸出請用 Markdown。",
      "如果是掃描檔，請直接 OCR 並輸出可搜尋文字，不要省略表格內容。",
    ].join("\n")
  );
}

async function extractImageText(filePath: string, mimeType: string) {
  return callGeminiExtraction(
    filePath,
    mimeType,
    [
      "你正在把官方附件整理成法律 RAG 資料。",
      "請對圖片做 OCR，保留標題、說明、表格、流程圖文字、欄位名稱與重要數字。",
      "輸出請用 Markdown，避免自行摘要。",
    ].join("\n")
  );
}

function extractArchiveEntry(filePath: string, entryPath: string) {
  const tarExecutable = process.platform === "win32" ? "tar.exe" : "tar";
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-archive-"));
  const tempPath = path.join(
    tempDir,
    `archive-${crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 12)}${path.extname(filePath).toLowerCase()}`
  );

  try {
    fs.copyFileSync(filePath, tempPath);
    const result = spawnSync(tarExecutable, ["-xOf", tempPath, entryPath], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });

    if (result.status !== 0 || !result.stdout.trim()) {
      throw new Error(
        `Unable to extract ${entryPath} from ${path.basename(filePath)}: ${result.stderr || result.status}`
      );
    }

    return result.stdout;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function xmlToText(xml: string, blockTags: string[]) {
  let normalized = xml;

  for (const tag of blockTags) {
    const openPattern = new RegExp(`<${tag}\\b[^>]*>`, "gi");
    const closePattern = new RegExp(`</${tag}>`, "gi");
    normalized = normalized.replace(openPattern, "\n");
    normalized = normalized.replace(closePattern, "\n");
  }

  normalized = normalized
    .replace(/<w:tab[^>]*\/>/gi, "\t")
    .replace(/<text:tab[^>]*\/>/gi, "\t")
    .replace(/<w:br[^>]*\/>/gi, "\n")
    .replace(/<text:line-break[^>]*\/>/gi, "\n");

  const $ = cheerio.load(normalized, { xmlMode: true });
  return normalizeText($.text());
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

async function extractDocxText(filePath: string) {
  const documentXml = extractArchiveEntry(filePath, "word/document.xml");
  return xmlToText(documentXml, ["w:p", "w:tr", "w:tbl"]);
}

async function extractOdtText(filePath: string) {
  const documentXml = extractArchiveEntry(filePath, "content.xml");
  return xmlToText(documentXml, ["text:p", "text:h", "table:table-row"]);
}

async function fallbackToMetadata(filePath: string, mimeType: string) {
  const fileName = path.basename(filePath);
  return [
    `附件檔名：${fileName}`,
    `MIME：${mimeType}`,
    `提取模型：${GEMINI_CHAT_MODEL}`,
    "此檔案未能完整抽取內容，先以附件中繼資訊保留到 RAG。",
  ].join("\n");
}

async function main() {
  if (!fs.existsSync(RAGUSE_DIR)) {
    throw new Error(`raguse directory not found: ${RAGUSE_DIR}`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const existingFile of fs.readdirSync(OUTPUT_DIR)) {
    if (existingFile.endsWith(".json")) {
      fs.unlinkSync(path.join(OUTPUT_DIR, existingFile));
    }
  }

  const files = fs
    .readdirSync(RAGUSE_DIR)
    .filter((file) => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort((left, right) => {
      const scoreDiff = attachmentNameScore(right) - attachmentNameScore(left);
      if (scoreDiff !== 0) return scoreDiff;
      return left.localeCompare(right, "zh-Hant");
    });

  console.log(`Preparing attachment extraction for ${files.length} files.`);

  const seenContentHashes = new Set<string>();

  for (const fileName of files) {
    const filePath = path.join(RAGUSE_DIR, fileName);
    const buffer = fs.readFileSync(filePath);
    const mimeType = detectMimeType(filePath, buffer);
    const contentHash = crypto.createHash("sha1").update(buffer).digest("hex");

    if (seenContentHashes.has(contentHash)) {
      console.log(`Skipping duplicate attachment content: ${fileName}`);
      continue;
    }

    seenContentHashes.add(contentHash);

    const id = buildAttachmentId(fileName);
    const outputPath = path.join(OUTPUT_DIR, `${id}.json`);
    const stat = fs.statSync(filePath);
    const effectiveDate = stat.mtime.toISOString().slice(0, 10);

    console.log(`Extracting attachment text: ${fileName}`);

    let text = "";
    try {
      if (mimeType === "application/pdf") {
        text = await extractPdfText(filePath);
      } else if (mimeType.startsWith("image/")) {
        text = await extractImageText(filePath, mimeType);
      } else if (
        mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        text = await extractDocxText(filePath);
      } else if (mimeType === "application/vnd.oasis.opendocument.text") {
        text = await extractOdtText(filePath);
      } else {
        text = await fallbackToMetadata(filePath, mimeType);
      }
    } catch (error) {
      console.warn(
        `Extraction failed for ${fileName}, storing metadata fallback.`,
        error
      );
      text = await fallbackToMetadata(filePath, mimeType);
    }

    const record: AttachmentTextRecord = {
      id,
      sourceId: id,
      sourceType: "attachment",
      title: fileName.replace(/\.[^.]+$/, ""),
      text,
      fileName,
      filePath,
      mimeType,
      sourceUrl: "",
      effectiveDate,
      extractedAt: new Date().toISOString(),
    };

    fs.writeFileSync(outputPath, JSON.stringify(record, null, 2), "utf-8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
