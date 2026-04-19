import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MARKETING_SEGMENTS } from "@/lib/routes";

// Public paths that don't require authentication.
// /auth covers the cross-origin handoff route /auth/accept which runs *before*
// the session cookie exists, so it must be reachable without auth.
const PUBLIC_PATHS = [
  "/login",
  "/invite",
  "/auth",
  "/api",
  ...MARKETING_SEGMENTS.map((s) => `/${s}`),
  "/_next",
  "/favicon",
];

// Non-org top-level segments — anything else that looks like a slug is an org.
const NON_ORG_SEGMENTS = new Set([
  "login",
  "logout",
  "onboarding",
  "settings",
  "prs",
  "invite",
  "auth",
  "api",
  "up",
  ...MARKETING_SEGMENTS,
]);

export function proxy(request: NextRequest) {
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

  // Mock mode: skip auth entirely
  if (process.env.MOCK_DATA === "true") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Landing page: edge-redirect authenticated users who have a remembered org.
  // This avoids a serverless cold start + Rails API call just to redirect,
  // shaving 200-500ms off FCP for returning users.
  if (pathname === "/") {
    const sessionToken = request.cookies.get("_ax_session")?.value;
    const lastOrg = request.cookies.get("_ax_last_org")?.value;
    if (sessionToken && lastOrg) {
      return NextResponse.redirect(new URL(`/${lastOrg}`, request.url));
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Allow public paths
  if (
    pathname === "/up" ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("_ax_session")?.value;
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Remember the current org slug so the landing page can edge-redirect next
  // time without hitting the serverless function.
  const firstSegment = pathname.split("/")[1];
  if (
    firstSegment &&
    !NON_ORG_SEGMENTS.has(firstSegment) &&
    /^[a-z0-9][a-z0-9-]*$/.test(firstSegment)
  ) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.cookies.set("_ax_last_org", firstSegment, {
      path: "/",
      maxAge: 60 * 60 * 24 * 90, // 90 days
      sameSite: "lax",
      httpOnly: false,
    });
    return response;
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)",
  ],
};
