import { createHash } from "crypto";

export const ADMIN_COOKIE_NAME = "admin_auth";

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

export function getAdminCookieToken(): string {
  return createHash("sha256").update(getAdminPassword()).digest("hex");
}

export function isValidAdminPassword(password: unknown): boolean {
  const adminPassword = getAdminPassword();
  return Boolean(adminPassword) && typeof password === "string" && password === adminPassword;
}

export function isValidAdminCookieToken(token: unknown): boolean {
  return Boolean(getAdminPassword()) && typeof token === "string" && token === getAdminCookieToken();
}
