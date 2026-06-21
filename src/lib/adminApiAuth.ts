import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME, getAdminCookieToken } from "@/lib/adminPasswordAuth";

export function isAuthorizedAdminRequest(req: NextRequest): boolean {
  return req.cookies.get(ADMIN_COOKIE_NAME)?.value === getAdminCookieToken();
}
