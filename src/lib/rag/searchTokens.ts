const HAN_SEQUENCE = /[\p{Script=Han}]{2,}/gu;
const WORD_TOKEN = /[\p{L}\p{N}]{2,}/gu;

const STOP_TOKENS = new Set([
  "是否",
  "如何",
  "可以",
  "需要",
  "辦理",
  "什麼",
  "哪些",
  "相關",
  "規定",
  "事項",
  "問題",
  "流程",
  "說明",
  "內容",
]);

function normalizeInput(value: string) {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").trim();
}

function addToken(store: Set<string>, token: string) {
  const normalized = normalizeInput(token).toLowerCase();
  if (normalized.length < 2 || STOP_TOKENS.has(normalized)) {
    return;
  }
  store.add(normalized);
}

function addWordTokens(store: Set<string>, value: string) {
  const matches = normalizeInput(value)
    .toLowerCase()
    .match(WORD_TOKEN);

  if (!matches) {
    return;
  }

  for (const match of matches) {
    addToken(store, match);
  }
}

function addHanNgrams(store: Set<string>, value: string) {
  const matches = normalizeInput(value).match(HAN_SEQUENCE);
  if (!matches) {
    return;
  }

  for (const match of matches) {
    for (let size = 4; size >= 2; size -= 1) {
      if (match.length < size) {
        continue;
      }

      for (let index = 0; index <= match.length - size; index += 1) {
        addToken(store, match.slice(index, index + size));
      }
    }
  }
}

function sortTokens(tokens: Iterable<string>) {
  return Array.from(tokens).sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }
    return left.localeCompare(right, "zh-Hant");
  });
}

export function buildSearchTokens(parts: string[], maxTokens = 80) {
  const tokens = new Set<string>();

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const snippet = normalizeInput(part).slice(0, 1200);
    addWordTokens(tokens, snippet);
    addHanNgrams(tokens, snippet);
  }

  return sortTokens(tokens).slice(0, maxTokens);
}

export function buildQuestionSearchTokens(question: string, maxTokens = 30) {
  const tokens = buildSearchTokens([question], maxTokens * 2);
  return tokens.slice(0, Math.min(maxTokens, 30));
}

export function normalizeSearchText(value: string) {
  return normalizeInput(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function countTokenOverlap(questionTokens: Iterable<string>, parts: string[]) {
  const targetTokens = new Set(buildSearchTokens(parts, 120));
  let score = 0;

  for (const token of questionTokens) {
    if (targetTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}
