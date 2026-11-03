# llm-quote-assistant

Turns a customer's free-text job description ("basement full of junk, old fridge, two flights of stairs") into an itemised price range for a home-services business.

> This is a clean-room reference implementation written from scratch to show the pattern. It contains no client or employer code, prompts or data. Rates in `pricing.ts` are example numbers.

## Background

I designed and built the production version of this at New Paltz Marketing: a **GenAI quoting chatbot for Velocity Graphics**, a large-format printing company, that turns a customer's description of a job into a structured quote request and lead. That code belongs to my employer and its client, so this repository is a clean-room rewrite, written from scratch, to show the same architecture and decisions publicly. No employer or client code, prompts or data are included.

## The core idea: the model extracts, code prices

LLMs are good at reading messy text and bad at arithmetic and policy. So the model is only allowed to return **facts** in a strict schema. A plain TypeScript function turns those facts into a price. The model never states a number the customer sees.

```
message ──► rule guard (hazardous?) ──► daily cap ──► redact email/phone
        ──► LLM ──► JSON.parse + zod schema ──┬─ valid ──► in scope? ──► priceJob() ──► quote range
                                              └─ invalid ─► retry once with the error ──► else "failed"
```

## Safeguards

| Risk | What this does |
| --- | --- |
| Model invents a price or discount | Prices come only from `priceJob()`; the schema has no price field. |
| Malformed or off-schema JSON | Zod validation; one retry that shows the model its exact error; then a safe "we'll follow up" instead of a guess. |
| Customer PII sent to a third party | Emails and phone numbers are redacted before the call. A test asserts the provider never sees them. |
| Jobs the business can't take | The model can return `inScope: false`; hazardous materials are refused, and obvious ones are caught by a rule before any model call. |
| Runaway API cost | Per-user daily cap, checked before the model call. |
| "Why did I get this quote?" | Every response has an `x-request-id`; logs record attempts and validity per request id, not message text. |
| Vendor lock-in / flaky tests | `LLMProvider` interface. `OpenAICompatibleProvider` for real use, `MockProvider` for tests and the offline demo. |

## Tests

```bash
npm install
npm test        # 15 tests, no network
npm run typecheck
```

Covers redaction, deterministic pricing, retry on invalid output, fenced JSON, giving up after two bad replies, out-of-scope and hazardous refusals (rule and model), the daily cap including UTC day rollover, provider errors, and the HTTP status mapping (200 / 401 / 400 / 422 / 429 / 503).

## Run it

```bash
npm run dev     # offline: uses a canned model reply
# or with any OpenAI-compatible endpoint:
LLM_API_KEY=... LLM_MODEL=gpt-4o-mini npm run dev

curl -X POST localhost:3000/quote -H 'content-type: application/json' -H 'x-user-id: demo' \
  -d '{"message":"Garage full of old furniture and a washer, ground floor"}'
```

Environment variables: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `DAILY_LIMIT`, `PORT`. Nothing secret is committed; see `.env.example`.

## License

MIT
