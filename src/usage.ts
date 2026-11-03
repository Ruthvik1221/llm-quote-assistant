/** Per-user daily cap on model calls, so one visitor (or bot) can't run up the API bill. */
export class DailyUsageLimiter {
  private counts = new Map<string, number>();
  constructor(
    private limit: number,
    private now: () => Date = () => new Date(),
  ) {}

  private key(userId: string) {
    return `${this.now().toISOString().slice(0, 10)}|${userId}`;
  }

  /** Reserve one call. Returns false if the user has hit today's limit. */
  tryConsume(userId: string): boolean {
    const k = this.key(userId);
    const used = this.counts.get(k) ?? 0;
    if (used >= this.limit) return false;
    this.counts.set(k, used + 1);
    return true;
  }

  remaining(userId: string): number {
    return Math.max(0, this.limit - (this.counts.get(this.key(userId)) ?? 0));
  }
}
