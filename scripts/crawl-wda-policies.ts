import * as fs from "node:fs";
import * as path from "node:path";
import * as cheerio from "cheerio";

const BASE_URL = "https://fw.wda.gov.tw/wda-employer/home/policy";
const SITE_ORIGIN = "https://fw.wda.gov.tw";
const PAGE_SIZE = 50;

interface PolicyListItem {
  id: string;
  title: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
}

interface PolicyAttachment {
  title: string;
  url: string;
}

interface WdaPolicy {
  id: string;
  title: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  content: string;
  attachments: PolicyAttachment[];
  url: string;
  source: "wda_policy";
  language: "zh-TW";
  crawledAt: string;
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function toAbsoluteUrl(href?: string) {
  if (!href) return "";
  return href.startsWith("http") ? href : `${SITE_ORIGIN}${href}`;
}

async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${url}`);
  }

  return {
    html: await response.text(),
    cookies: response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]),
  };
}

async function postListPage(page: number, csrf: string, cookies: string[]) {
  const body = new URLSearchParams({
    _csrf: csrf,
    size: String(PAGE_SIZE),
    page: String(page),
  });

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies.join("; "),
      Referer: BASE_URL,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when posting policy list page ${page}`);
  }

  return response.text();
}

function parseListPage(html: string) {
  const $ = cheerio.load(html);
  const csrf = $('input[name="_csrf"]').attr("value") || "";
  const pageCount = $("#page option").length || 1;
  const items: PolicyListItem[] = [];

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    const link = $(row).find('a[href*="/wda-employer/home/policy/"]').first();
    const href = link.attr("href");
    const id = href?.split("/").pop();

    if (!href || !id) return;

    items.push({
      id,
      category: normalizeText(cells.eq(0).text()),
      title: normalizeText(link.attr("title") || link.text()),
      publishedAt: normalizeText(cells.eq(2).text()),
      updatedAt: normalizeText(cells.eq(3).text()),
      url: toAbsoluteUrl(href),
    });
  });

  return { csrf, pageCount, items };
}

function parseDetailPage(html: string, listItem: PolicyListItem): WdaPolicy {
  const $ = cheerio.load(html);
  const titleText =
    normalizeText($("div.text-title").first().text()).replace(/^標題：/, "") ||
    listItem.title;
  const contentNode = $("div.text-con").first().clone();
  contentNode.find("br").replaceWith("\n");
  const content = normalizeText(contentNode.text().replace(/^內容：/, ""));

  const attachments: PolicyAttachment[] = $("div.text-download a")
    .map((_, link) => ({
      title: normalizeText($(link).text().replace(/^[•\s]+/, "").replace(/^\[另開新視窗\]\s*/, "")),
      url: toAbsoluteUrl($(link).attr("href")),
    }))
    .get();

  const publishedText = normalizeText(
    $('span.text-info:contains("發佈日期")').first().text().replace(/^.*發佈日期：/, "")
  );
  const updatedText = normalizeText(
    $('span.text-info:contains("更新日期")').first().text().replace(/^.*更新日期：/, "")
  );
  const categoryText = normalizeText(
    $('span.text-info:contains("類別")').first().text().replace(/^.*類別：/, "")
  );

  return {
    id: listItem.id,
    title: titleText || listItem.title,
    category: categoryText || listItem.category,
    publishedAt: publishedText || listItem.publishedAt,
    updatedAt: updatedText || listItem.updatedAt,
    content,
    attachments,
    url: listItem.url,
    source: "wda_policy",
    language: "zh-TW",
    crawledAt: new Date().toISOString(),
  };
}

async function main() {
  const outputDir = path.join(process.cwd(), "data", "wda_policies");
  fs.mkdirSync(outputDir, { recursive: true });

  const firstPage = await fetchPage(BASE_URL);
  const parsedFirstPage = parseListPage(firstPage.html);
  const allItems = [...parsedFirstPage.items];

  console.log(`Found ${parsedFirstPage.pageCount} policy pages.`);

  for (let pageIndex = 1; pageIndex < parsedFirstPage.pageCount; pageIndex += 1) {
    const html = await postListPage(pageIndex, parsedFirstPage.csrf, firstPage.cookies);
    const parsed = parseListPage(html);
    allItems.push(...parsed.items);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values());
  const policies: WdaPolicy[] = [];

  for (const item of uniqueItems) {
    console.log(`Fetching policy: ${item.title}`);
    const detail = await fetchPage(item.url);
    const policy = parseDetailPage(detail.html, item);
    policies.push(policy);
    fs.writeFileSync(
      path.join(outputDir, `${item.id}.json`),
      JSON.stringify(policy, null, 2),
      "utf-8"
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  fs.writeFileSync(
    path.join(outputDir, "_all_policies.json"),
    JSON.stringify(policies, null, 2),
    "utf-8"
  );

  console.log(`Saved ${policies.length} WDA policy records to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
