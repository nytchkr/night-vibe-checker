const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

function missingRedisConfig(): Error {
  return new Error("Upstash Redis is not configured.");
}

async function command<T>(parts: string[]): Promise<T | null> {
  if (!upstashUrl || !upstashToken) throw missingRedisConfig();

  const response = await fetch(`${upstashUrl}/${parts.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${upstashToken}` },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as UpstashResponse<T> | null;
  if (!response.ok || body?.error) {
    throw new Error(body?.error || `Upstash Redis command failed with HTTP ${response.status}`);
  }

  return body?.result ?? null;
}

export const redis = {
  async get(key: string): Promise<unknown> {
    const value = await command<string | null>(["get", key]);
    if (typeof value !== "string") return value;

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  },

  async set(key: string, value: unknown, options?: { ex?: number }): Promise<unknown> {
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    const parts = ["set", key, payload];
    if (options?.ex) parts.push("EX", String(options.ex));
    return command(parts);
  },
};
