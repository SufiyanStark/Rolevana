export class SourceHttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfterMs?: number) { super(message); }
}

export class SourceHttpClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly options: { timeoutMs?: number; retries?: number; baseBackoffMs?: number; sleep?: (ms: number) => Promise<void> } = {}
  ) {}

  async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const retries = this.options.retries ?? 2;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.fetcher(url, { ...init, headers: { accept: "application/json", "user-agent": "Rolevana/0.2 job discovery", ...init.headers }, signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000) });
        if (response.ok) return await response.json() as T;
        const retryAfter = Number(response.headers.get("retry-after") ?? 0) * 1000;
        if ((response.status === 429 || response.status >= 500) && attempt < retries) {
          await (this.options.sleep ?? defaultSleep)(retryAfter || (this.options.baseBackoffMs ?? 250) * 2 ** attempt);
          continue;
        }
        throw new SourceHttpError(response.status, `Job source returned HTTP ${response.status}.`, retryAfter || undefined);
      } catch (error) {
        if (error instanceof SourceHttpError) throw error;
        if (attempt >= retries) throw new SourceHttpError(0, "Job source request timed out or was unavailable.");
        await (this.options.sleep ?? defaultSleep)((this.options.baseBackoffMs ?? 250) * 2 ** attempt);
      }
    }
    throw new SourceHttpError(0, "Job source request failed.");
  }
  async text(url: string, init: RequestInit = {}): Promise<string> {
    const retries = this.options.retries ?? 2;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.fetcher(url, { ...init, headers: { accept: "application/rss+xml, application/xml, text/xml, text/plain", "user-agent": "Rolevana/0.3 job discovery", ...init.headers }, signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000) });
        if (response.ok) return await response.text();
        const retryAfter = Number(response.headers.get("retry-after") ?? 0) * 1000;
        if ((response.status === 429 || response.status >= 500) && attempt < retries) { await (this.options.sleep ?? defaultSleep)(retryAfter || (this.options.baseBackoffMs ?? 250) * 2 ** attempt); continue; }
        throw new SourceHttpError(response.status, `Job source returned HTTP ${response.status}.`, retryAfter || undefined);
      } catch (error) {
        if (error instanceof SourceHttpError) throw error;
        if (attempt >= retries) throw new SourceHttpError(0, "Job source request timed out or was unavailable.");
        await (this.options.sleep ?? defaultSleep)((this.options.baseBackoffMs ?? 250) * 2 ** attempt);
      }
    }
    throw new SourceHttpError(0, "Job source request failed.");
  }
}
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
