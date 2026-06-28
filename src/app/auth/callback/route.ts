import { NextResponse, type NextRequest } from "next/server";

export function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  return NextResponse.redirect(url);
}
