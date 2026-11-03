import { createApp } from "./app.js";
import { QuoteAssistant } from "./assistant.js";
import { MockProvider, OpenAICompatibleProvider, type LLMProvider } from "./llm.js";
import { DailyUsageLimiter } from "./usage.js";

// With no API key, run against a canned reply so the demo works offline.
const llm: LLMProvider = process.env.LLM_API_KEY
  ? new OpenAICompatibleProvider({
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    })
  : new MockProvider(
      Array.from({ length: 100 }, () =>
        JSON.stringify({ inScope: true, service: "junk_removal", volumeCubicYards: 4, stairFlights: 1, heavyItems: ["appliance"], hazardous: false, summary: "Demo reply" }),
      ),
    );

const assistant = new QuoteAssistant(llm, new DailyUsageLimiter(Number(process.env.DAILY_LIMIT ?? 20)), {
  info: (o) => console.log(JSON.stringify(o)),
});

const port = Number(process.env.PORT ?? 3000);
createApp(assistant).listen(port, () => console.log(`listening on http://localhost:${port}`));
