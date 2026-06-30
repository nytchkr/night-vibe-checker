import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

// null when env vars are absent (CI / local without Upstash)
export const redis: Redis | null =
  url && token ? new Redis({ url, token }) : null;
