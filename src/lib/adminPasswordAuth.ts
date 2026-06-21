import { createHash } from "crypto";

export const ADMIN_COOKIE_NAME = "nightvibe_admin";

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "nightvibe-admin-2026";
}

export function getAdminCookieToken(): string {
  return createHash("sha256").update(getAdminPassword()).digest("hex");
}

export function isValidAdminPassword(password: unknown): boolean {
  return typeof password === "string" && password === getAdminPassword();
}
