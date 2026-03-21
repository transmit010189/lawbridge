const DEFAULT_GENERATION_MODEL = "models/gemini-3.1-flash-lite-preview";
const DEFAULT_CHAT_MODEL = "gemini-3.1-flash-lite-preview";
const DEFAULT_GEMINI_EMBEDDING_MODEL = "models/gemini-embedding-001";
const DEFAULT_GEMINI_EMBEDDING_SDK_MODEL = "gemini-embedding-001";
const DEFAULT_VERTEX_EMBEDDING_MODEL = "gemini-embedding-2-preview";

const canUseGoogleCredentials = Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.K_SERVICE ||
    process.env.GAE_ENV ||
    process.env.FUNCTION_TARGET
);

export const GEMINI_GENERATION_MODEL =
  process.env.GEMINI_GENERATION_MODEL || DEFAULT_GENERATION_MODEL;

export const GEMINI_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL || DEFAULT_CHAT_MODEL;

export const GEMINI_VISION_MODEL =
  process.env.GEMINI_VISION_MODEL || GEMINI_GENERATION_MODEL;

export const GEMINI_ATTACHMENT_EXTRACTION_MODEL =
  process.env.GEMINI_ATTACHMENT_EXTRACTION_MODEL || GEMINI_GENERATION_MODEL;

export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_GEMINI_EMBEDDING_MODEL;

export const GEMINI_EMBEDDING_SDK_MODEL =
  process.env.GEMINI_EMBEDDING_SDK_MODEL ||
  DEFAULT_GEMINI_EMBEDDING_SDK_MODEL;

export const VERTEX_AI_PROJECT_ID =
  process.env.VERTEX_AI_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "";

export const VERTEX_AI_LOCATION =
  process.env.VERTEX_AI_LOCATION || "us-central1";

export const VERTEX_AI_EMBEDDING_MODEL =
  process.env.VERTEX_AI_EMBEDDING_MODEL || DEFAULT_VERTEX_EMBEDDING_MODEL;

export const USE_VERTEX_EMBEDDING =
  process.env.VERTEX_AI_EMBEDDING_ENABLED === "1" ||
  (process.env.VERTEX_AI_EMBEDDING_ENABLED !== "0" &&
    Boolean(VERTEX_AI_PROJECT_ID && canUseGoogleCredentials));
