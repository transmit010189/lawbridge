import crypto from "crypto";
import type { PaymentMethod, TransactionStatus } from "@/types";

export interface NewebPayConfig {
  merchantId: string;
  hashKey: string;
  hashIV: string;
  version: string;
  mode: "production" | "test";
  appBaseUrl: string;
  gatewayUrl: string;
  configured: boolean;
}

export interface NewebPayTradeResult {
  Status?: string;
  Message?: string;
  Result?: Record<string, string>;
}

const TEST_GATEWAY_URL = "https://ccore.newebpay.com/MPG/mpg_gateway";
const PROD_GATEWAY_URL = "https://core.newebpay.com/MPG/mpg_gateway";

export function getNewebPayConfig(): NewebPayConfig {
  const mode =
    process.env.NEWEBPAY_MODE === "production" ? "production" : "test";
  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    "https://lawbridge-web--lawbridge-tw.asia-east1.hosted.app";

  const merchantId = process.env.NEWEBPAY_MERCHANT_ID || "";
  const hashKey = process.env.NEWEBPAY_HASH_KEY || "";
  const hashIV = process.env.NEWEBPAY_HASH_IV || "";
  const version = process.env.NEWEBPAY_VERSION || "2.0";
  const gatewayUrl =
    process.env.NEWEBPAY_GATEWAY_URL ||
    (mode === "production" ? PROD_GATEWAY_URL : TEST_GATEWAY_URL);

  return {
    merchantId,
    hashKey,
    hashIV,
    version,
    mode,
    appBaseUrl: appBaseUrl.replace(/\/$/, ""),
    gatewayUrl,
    configured: Boolean(
      merchantId &&
        hashKey &&
        hashIV &&
        hashKey.length === 32 &&
        hashIV.length === 16
    ),
  };
}

function toQueryString(params: Record<string, string>) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

function aesEncrypt(input: string, key: string, iv: string) {
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let encrypted = cipher.update(input, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

function aesDecrypt(input: string, key: string, iv: string) {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8")
  );
  let decrypted = decipher.update(input, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function createNewebPayTradeInfo(
  params: Record<string, string>,
  config: NewebPayConfig
) {
  return aesEncrypt(toQueryString(params), config.hashKey, config.hashIV);
}

export function createNewebPayTradeSha(
  tradeInfo: string,
  config: NewebPayConfig
) {
  const payload = `HashKey=${config.hashKey}&${tradeInfo}&HashIV=${config.hashIV}`;
  return crypto.createHash("sha256").update(payload).digest("hex").toUpperCase();
}

export function verifyNewebPayTradeSha(
  tradeInfo: string,
  tradeSha: string,
  config: NewebPayConfig
) {
  return createNewebPayTradeSha(tradeInfo, config) === tradeSha;
}

export function decryptNewebPayTradeInfo(
  tradeInfo: string,
  config: NewebPayConfig
): NewebPayTradeResult {
  const raw = aesDecrypt(tradeInfo, config.hashKey, config.hashIV).trim();
  return JSON.parse(raw) as NewebPayTradeResult;
}

export function buildNewebPayOrderPayload({
  merchantOrderNo,
  amount,
  itemDesc,
  email,
  paymentMethod,
  config,
}: {
  merchantOrderNo: string;
  amount: number;
  itemDesc: string;
  email?: string;
  paymentMethod: PaymentMethod;
  config: NewebPayConfig;
}) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const tradeParams: Record<string, string> = {
    MerchantID: config.merchantId,
    RespondType: "JSON",
    TimeStamp: timeStamp,
    Version: config.version,
    MerchantOrderNo: merchantOrderNo,
    Amt: String(amount),
    ItemDesc: itemDesc,
    ReturnURL: `${config.appBaseUrl}/api/wallet/newebpay/return`,
    NotifyURL: `${config.appBaseUrl}/api/wallet/newebpay/notify`,
    ClientBackURL: `${config.appBaseUrl}/?tab=wallet&payment=processing`,
    LoginType: "0",
    Email: email || "",
    CREDIT: paymentMethod === "card" ? "1" : "0",
    CVS: paymentMethod === "cvs" ? "1" : "0",
    TradeLimit: "900",
  };

  if (paymentMethod === "cvs") {
    tradeParams.ExpireDate = "7";
  }

  const tradeInfo = createNewebPayTradeInfo(tradeParams, config);
  const tradeSha = createNewebPayTradeSha(tradeInfo, config);

  return {
    merchantId: config.merchantId,
    tradeInfo,
    tradeSha,
    version: config.version,
  };
}

export function createMerchantOrderNo() {
  const timePart = Date.now().toString();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `LB${timePart}${randomPart}`.slice(0, 30);
}

export function resolveNewebPayStatus(
  tradeResult: NewebPayTradeResult
): TransactionStatus {
  const result = tradeResult.Result || {};

  if (tradeResult.Status !== "SUCCESS") {
    return "failed";
  }

  const hasPaymentConfirmation =
    Boolean(result.PayTime) ||
    Boolean(result.Auth) ||
    result.RespondCode === "00";

  if (hasPaymentConfirmation) {
    return "settled";
  }

  if (result.CodeNo || result.Barcode_1 || result.Barcode_2 || result.Barcode_3 || result.VAccount) {
    return "pending";
  }

  return "pending";
}

export function formatPaymentInstructions(
  paymentMethod: PaymentMethod | undefined,
  result: Record<string, string>
) {
  if (paymentMethod === "cvs" && result.CodeNo) {
    return `超商繳費代碼 ${result.CodeNo}`;
  }

  if (result.VAccount) {
    return `虛擬帳號 ${result.VAccount}`;
  }

  return "";
}
