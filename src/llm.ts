export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Anything that can turn messages into text. Swappable so tests never hit a network. */
export interface LLMProvider {
  complete(messages: ChatMessage[], opts?: { signal?: AbortSignal }): Promise<string>;
}

/** Works with any OpenAI-compatible /chat/completions endpoint. */
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    private cfg: { baseUrl: string; apiKey: string; model: string; timeoutMs?: number },
  ) {}

  async complete(messages: ChatMessage[], opts: { signal?: AbortSignal } = {}): Promise<string> {
    const signal = opts.signal ?? AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000);
    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.apiKey}` },
      body: JSON.stringify({
        model: this.cfg.model,
        messages,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("LLM returned no content");
    return content;
  }
}

/** Returns scripted replies in order and records what it was sent. For tests and offline demos. */
export class MockProvider implements LLMProvider {
  public calls: ChatMessage[][] = [];
  constructor(private replies: (string | Error)[]) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    const next = this.replies.shift();
    if (next === undefined) throw new Error("MockProvider: no more scripted replies");
    if (next instanceof Error) throw next;
    return next;
  }
}
