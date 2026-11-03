import { randomUUID } from "node:crypto";
import express from "express";
import type { QuoteAssistant } from "./assistant.js";
import { QuoteRequest } from "./schema.js";

const STATUS = { quote: 200, refused: 422, rate_limited: 429, failed: 503 } as const;

export function createApp(assistant: QuoteAssistant) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));

  // Every response carries a request id so a customer complaint can be traced in the logs.
  app.use((req, res, next) => {
    const id = req.header("x-request-id") ?? randomUUID();
    res.locals.requestId = id;
    res.setHeader("x-request-id", id);
    next();
  });

  app.post("/quote", async (req, res, next) => {
    try {
      const userId = req.header("x-user-id");
      if (!userId) return void res.status(401).json({ error: "x-user-id header required" });
      const body = QuoteRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.flatten() });

      const result = await assistant.quote(userId, body.data.message, res.locals.requestId);
      res.status(STATUS[result.kind]).json(result);
    } catch (e) {
      next(e);
    }
  });

  return app;
}
