import {
  readNewebPayCallbackPayload,
  syncNewebPayTransaction,
} from "@/lib/payments/newebpayServer";
import { getNewebPayConfig } from "@/lib/payments/newebpay";

function buildRedirectHtml(url: string) {
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="1;url=${url}" />
    <title>Payment Redirect</title>
  </head>
  <body>
    <p>Payment processed. Redirecting...</p>
    <script>window.location.replace(${JSON.stringify(url)});</script>
  </body>
</html>`;
}

export async function POST(req: Request) {
  const config = getNewebPayConfig();
  const fallbackUrl = `${config.appBaseUrl}/?tab=wallet&payment=failed`;

  try {
    const payload = await readNewebPayCallbackPayload(req);
    const result = await syncNewebPayTransaction(payload);
    const redirectUrl = `${config.appBaseUrl}/?tab=wallet&payment=${encodeURIComponent(result.status)}`;

    return new Response(buildRedirectHtml(redirectUrl), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 200,
    });
  } catch (err) {
    console.error("NewebPay return error:", err);
    return new Response(buildRedirectHtml(fallbackUrl), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 200,
    });
  }
}
