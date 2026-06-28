import "server-only";
import { neon } from "@neondatabase/serverless";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — add to .env.local");
  return url;
}

declare global {
  // eslint-disable-next-line no-var
  var __neonSql: ReturnType<typeof neon> | undefined;
}

function getDb(): ReturnType<typeof neon> {
  globalThis.__neonSql ??= neon(getDatabaseUrl());
  return globalThis.__neonSql;
}

const sqlProxyTarget = (() => undefined) as unknown as ReturnType<typeof neon>;

export const sql = new Proxy(sqlProxyTarget, {
  get(_target, prop) {
    const db = getDb();
    const value = Reflect.get(db, prop, db);
    return typeof value === "function" ? value.bind(db) : value;
  },
  apply(_target, _thisArg, args) {
    return getDb().apply(undefined, args as Parameters<ReturnType<typeof neon>>);
  },
});

export default sql;
