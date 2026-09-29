import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

// GitHub Marketplace events (install, plan change, cancel). Billing runs through Clerk,
// so for now these are verified and recorded only; they don't change anyone's access.

const MAX_BODY_BYTES = 1024 * 1024;

const purchaseSchema = z.object({
  action: z.string(),
  marketplace_purchase: z
    .object({
      account: z.object({ login: z.string(), type: z.string() }).partial(),
      plan: z.object({ name: z.string() }).partial(),
    })
    .partial()
    .optional(),
});

// Constant-time check of GitHub's X-Hub-Signature-256 ("sha256=<hex>")
const isValidSignature = (body: string, header: string | null, secret: string) => {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
  );
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
};

export async function POST(request: Request) {
  const secret = process.env.GITHUB_MARKETPLACE_WEBHOOK_SECRET;
  // Fail closed: without a secret nothing can be verified
  if (!secret || secret.length < 20) {
    console.error("marketplace-webhook: GITHUB_MARKETPLACE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (!isValidSignature(body, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");

  if (event === "ping") {
    return NextResponse.json({ ok: true });
  }

  if (event !== "marketplace_purchase") {
    return NextResponse.json({ ignored: event }, { status: 202 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = purchaseSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Unexpected payload" }, { status: 400 });
  }

  // Metadata only: which action, which account, which plan
  const { action, marketplace_purchase: purchase } = parsed.data;
  console.info("marketplace-webhook", {
    action,
    account: purchase?.account?.login,
    accountType: purchase?.account?.type,
    plan: purchase?.plan?.name,
  });

  return NextResponse.json({ ok: true });
}
