import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  void req;
  return new Response("0|ErrorMessage=ECPay deprecated", { status: 410 });
}
