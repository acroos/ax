import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MARKETING_SEGMENTS } from "@/lib/routes";

// Public paths that don't require authentication.
// /auth covers the cross-origin handoff route /auth/accept which runs *before*
// the session cookie exists, so it must be reachable without auth.
const PUBLIC_PATHS = [
  "/login", "/invite", "/auth", "/api",
  ...MARKETING_SEGMENTS.map((s) => `/${s}`),
  "/_next", "/favicon",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Forward the pathname to server components via a request header. The root
  // layout uses this to derive the org slug for org-scoped sidebar rendering
  // without having direct access to route params at the root level.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const repoParam = request.nextUrl.searchParams.get("repo");
  if (repoParam) {
    requestHeaders.set("x-repo-filter", repoParam);
  }

  // Allow public paths
  if (pathname === "/" || pathname === "/up" || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("_ax_session")?.value;
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
