import { describe, expect, it } from "vitest";
import { QuoteAssistant } from "../src/assistant.js";
import { MockProvider } from "../src/llm.js";
import { priceJob } from "../src/pricing.js";
import { redact } from "../src/redact.js";
import { DailyUsageLimiter } from "../src/usage.js";

const good = {
  inScope: true,
  service: "junk_removal",
  volumeCubicYards: 6,
  stairFlights: 2,
  heavyItems: ["appliance"],
  hazardous: false,
  summary: "Basement clear-out with an old fridge",
};
const make = (replies: (string | Error)[], limit = 5) => {
  const llm = new MockProvider(replies);
  return { llm, assistant: new QuoteAssistant(llm, new DailyUsageLimiter(limit)) };
};

describe("redact", () => {
  it("removes emails and US phone numbers", () => {
    const r = redact("Call me at (845) 555-0123 or 845.555.0199, or jo.smith+jobs@example.com");
    expect(r.text).toBe("Call me at [phone] or [phone], or [email]");
    expect(r.redactions).toBe(3);
  });
});

describe("priceJob", () => {
  it("is deterministic and itemised, in integer cents", () => {
    const q = priceJob({ ...good, service: "junk_removal" } as never);
    // 9,900 base + 6*3,500 + 2*2,500 + 5,000 = 40,900 -> range 34,765..47,035 rounded to $5
    expect(q.lines.map((l) => l.cents)).toEqual([9_900, 21_000, 5_000, 5_000]);
    expect(q.lowCents).toBe(35_000);
    expect(q.highCents).toBe(47_000);
    expect(priceJob({ ...good } as never)).toEqual(q);
  });
});

describe("QuoteAssistant", () => {
  it("quotes from a valid extraction, and the model never sees contact details", async () => {
    const { llm, assistant } = make([JSON.stringify(good)]);
    const r = await assistant.quote("u1", "Basement junk + old fridge, 2 flights. Text me 845-555-0123", "req-1");
    expect(r.kind).toBe("quote");
    expect(JSON.stringify(llm.calls[0])).not.toContain("555-0123");
  });

  it("retries once with the validation error, then succeeds", async () => {
    const { llm, assistant } = make(['{"inScope": true, "service": "rocket_launch"}', JSON.stringify(good)]);
    const r = await assistant.quote("u1", "Clear out my garage please", "req-2");
    expect(r).toMatchObject({ kind: "quote", attempts: 2 });
    expect(llm.calls[1].at(-1)?.content).toMatch(/invalid: .*service/);
  });

  it("accepts a fenced JSON reply", async () => {
    const { assistant } = make(["```json\n" + JSON.stringify(good) + "\n```"]);
    expect((await assistant.quote("u1", "Clear out my garage please", "r")).kind).toBe("quote");
  });

  it("gives up after two invalid replies instead of guessing a price", async () => {
    const { assistant } = make(["not json", "still not json"]);
    expect((await assistant.quote("u1", "Clear out my garage please", "r")).kind).toBe("failed");
  });

  it("refuses out-of-scope requests the model flags", async () => {
    const { assistant } = make([JSON.stringify({ inScope: false, reason: "We don't do roofing." })]);
    expect(await assistant.quote("u1", "Can you fix my roof?", "r")).toEqual({ kind: "refused", reason: "We don't do roofing." });
  });

  it("refuses obvious hazardous jobs by rule without spending a model call", async () => {
    const { llm, assistant } = make([]);
    expect((await assistant.quote("u1", "Haul away 10 paint cans and propane tanks", "r")).kind).toBe("refused");
    expect(llm.calls).toHaveLength(0);
  });

  it("refuses when the model marks the job hazardous", async () => {
    const { assistant } = make([JSON.stringify({ ...good, hazardous: true })]);
    expect((await assistant.quote("u1", "Old stuff from a lab", "r")).kind).toBe("refused");
  });

  it("enforces the per-user daily cap", async () => {
    const { assistant } = make([JSON.stringify(good), JSON.stringify(good), JSON.stringify(good)], 2);
    expect((await assistant.quote("u1", "Clear out my garage please", "r")).kind).toBe("quote");
    expect((await assistant.quote("u1", "Clear out my garage please", "r")).kind).toBe("quote");
    expect((await assistant.quote("u1", "Clear out my garage please", "r")).kind).toBe("rate_limited");
    expect((await assistant.quote("u2", "Clear out my garage please", "r")).kind).toBe("quote");
  });

  it("returns a friendly failure when the provider errors", async () => {
    const { assistant } = make([new Error("timeout")]);
    expect((await assistant.quote("u1", "Clear out my garage please", "r")).kind).toBe("failed");
  });
});

describe("DailyUsageLimiter", () => {
  it("resets on a new UTC day", () => {
    let now = new Date("2026-11-10T23:59:00Z");
    const lim = new DailyUsageLimiter(1, () => now);
    expect(lim.tryConsume("u")).toBe(true);
    expect(lim.tryConsume("u")).toBe(false);
    now = new Date("2026-11-11T00:01:00Z");
    expect(lim.tryConsume("u")).toBe(true);
  });
});
