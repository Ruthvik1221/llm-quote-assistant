import type { ChatMessage, LLMProvider } from "./llm.js";
import { priceJob, type Quote } from "./pricing.js";
import { redact } from "./redact.js";
import { Extraction, SERVICES } from "./schema.js";
import type { DailyUsageLimiter } from "./usage.js";

export const SYSTEM_PROMPT = `You extract facts from a customer's description of a home-services job.
Services offered: ${SERVICES.join(", ")}.
Reply with ONE JSON object and nothing else, in one of these shapes:
{"inScope": true, "service": <service>, "volumeCubicYards": <number 0-60>, "stairFlights": <int>,
 "heavyItems": [<"piano"|"safe"|"hot_tub"|"appliance"|"other">], "hazardous": <bool>, "summary": <short string>}
{"inScope": false, "reason": <short string>}
Never state a price. If the request is not one of the services, use inScope false.
Mark hazardous true for paint, chemicals, asbestos, fuel, propane, medical waste or similar.`;

/** Cheap guard before spending a model call: obvious hazardous-waste requests are refused by rule. */
const HAZARD_WORDS = /\b(asbestos|propane|gasoline|motor oil|medical waste|needles?|chemicals?|paint cans?)\b/i;

export type QuoteResult =
  | { kind: "quote"; service: string; summary: string; quote: Quote; attempts: number }
  | { kind: "refused"; reason: string }
  | { kind: "rate_limited" }
  | { kind: "failed"; reason: string };

export interface Logger {
  info(obj: Record<string, unknown>): void;
}

export class QuoteAssistant {
  constructor(
    private llm: LLMProvider,
    private limiter: DailyUsageLimiter,
    private log: Logger = { info: () => {} },
  ) {}

  async quote(userId: string, message: string, requestId: string): Promise<QuoteResult> {
    if (HAZARD_WORDS.test(message)) {
      this.log.info({ requestId, event: "refused_by_rule" });
      return { kind: "refused", reason: "We can't haul hazardous materials. Please contact your local hazardous-waste facility." };
    }
    if (!this.limiter.tryConsume(userId)) {
      this.log.info({ requestId, event: "rate_limited" });
      return { kind: "rate_limited" };
    }

    const { text, redactions } = redact(message);
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ];

    // One retry: if the model's JSON is malformed or off-schema, show it the error and ask again.
    for (let attempt = 1; attempt <= 2; attempt++) {
      let raw: string;
      try {
        raw = await this.llm.complete(messages);
      } catch (e) {
        this.log.info({ requestId, event: "llm_error", attempt, error: (e as Error).message });
        return { kind: "failed", reason: "The estimator is unavailable right now. Please try again shortly." };
      }

      const parsed = safeParse(raw);
      this.log.info({ requestId, event: "llm_reply", attempt, redactions, valid: parsed.ok });
      if (parsed.ok) {
        const ex = parsed.value;
        if (!ex.inScope) return { kind: "refused", reason: ex.reason };
        if (ex.hazardous) return { kind: "refused", reason: "This job may involve hazardous materials, so we need to quote it in person." };
        return { kind: "quote", service: ex.service, summary: ex.summary, quote: priceJob(ex), attempts: attempt };
      }
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: `That reply was invalid: ${parsed.error}. Reply again with only the JSON object.` },
      );
    }
    return { kind: "failed", reason: "We couldn't estimate that automatically. A team member will follow up." };
  }
}

function safeParse(raw: string): { ok: true; value: Extraction } | { ok: false; error: string } {
  let json: unknown;
  try {
    // Tolerate a ```json fence, nothing more.
    json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  const r = Extraction.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ") };
  return { ok: true, value: r.data };
}
