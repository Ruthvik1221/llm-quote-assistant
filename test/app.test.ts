import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { QuoteAssistant } from "../src/assistant.js";
import { MockProvider } from "../src/llm.js";
import { DailyUsageLimiter } from "../src/usage.js";

const reply = JSON.stringify({
  inScope: true,
  service: "moving",
  volumeCubicYards: 10,
  stairFlights: 0,
  heavyItems: [],
  hazardous: false,
  summary: "Studio apartment move",
});
const app = () => createApp(new QuoteAssistant(new MockProvider([reply]), new DailyUsageLimiter(5)));

describe("HTTP API", () => {
  it("returns a quote and echoes the request id", async () => {
    const res = await request(app())
      .post("/quote")
      .set("x-user-id", "u1")
      .set("x-request-id", "abc-123")
      .send({ message: "Moving a studio apartment across town" })
      .expect(200);
    expect(res.headers["x-request-id"]).toBe("abc-123");
    expect(res.body.quote.lowCents).toBeLessThan(res.body.quote.highCents);
  });

  it("requires a user id and a message", async () => {
    await request(app()).post("/quote").send({ message: "Moving a studio" }).expect(401);
    await request(app()).post("/quote").set("x-user-id", "u1").send({}).expect(400);
  });

  it("maps refusals to 422", async () => {
    await request(app()).post("/quote").set("x-user-id", "u1").send({ message: "Remove the asbestos tiles" }).expect(422);
  });
});
