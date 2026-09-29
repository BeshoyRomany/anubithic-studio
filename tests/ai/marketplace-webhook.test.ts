import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { POST } = await import("../../src/app/api/github/marketplace-webhook/route");

const SECRET = "s".repeat(64);
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const call = (body: string, headers: Record<string, string>) =>
  POST(
    new Request("https://app.test/api/github/marketplace-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );

const purchase = JSON.stringify({
  action: "purchased",
  marketplace_purchase: { account: { login: "octocat", type: "User" }, plan: { name: "Free" } },
});

beforeEach(() => {
  process.env.GITHUB_MARKETPLACE_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  delete process.env.GITHUB_MARKETPLACE_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe("GitHub Marketplace webhook", () => {
  it("answers GitHub's signed ping", async () => {
    const body = JSON.stringify({ zen: "Keep it logically awesome." });
    const res = await call(body, { "x-github-event": "ping", "x-hub-signature-256": sign(body) });
    expect(res.status).toBe(200);
  });

  it("accepts a signed purchase event and logs metadata only", async () => {
    const res = await call(purchase, {
      "x-github-event": "marketplace_purchase",
      "x-hub-signature-256": sign(purchase),
    });
    expect(res.status).toBe(200);
    expect(console.info).toHaveBeenCalledWith("marketplace-webhook", {
      action: "purchased",
      account: "octocat",
      accountType: "User",
      plan: "Free",
    });
  });

  it("refuses a missing, forged or tampered signature", async () => {
    const event = { "x-github-event": "marketplace_purchase" };
    expect((await call(purchase, event)).status).toBe(401);
    expect((await call(purchase, { ...event, "x-hub-signature-256": sign(purchase, "w".repeat(64)) })).status).toBe(401);
    expect((await call(purchase.replace("Free", "Pro"), { ...event, "x-hub-signature-256": sign(purchase) })).status).toBe(401);
  });

  it("fails closed when the secret is not configured", async () => {
    delete process.env.GITHUB_MARKETPLACE_WEBHOOK_SECRET;
    const res = await call(purchase, {
      "x-github-event": "marketplace_purchase",
      "x-hub-signature-256": sign(purchase),
    });
    expect(res.status).toBe(500);
  });
});
