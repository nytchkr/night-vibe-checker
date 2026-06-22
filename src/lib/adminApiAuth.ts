import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, isValidAdminCookieToken } from "@/lib/adminPasswordAuth";

export function isAuthorizedAdminRequest(req: NextRequest): boolean {
  return isValidAdminCookieToken(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
}
