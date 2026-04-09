import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public paths that don't require authentication
const PUBLIC_PATHS = ["/login", "/invite", "/api", "/docs", "/_next", "/favicon"];

export function middleware(request: NextRequest) {
  // Only enforce auth in managed mode (when AX_API_URL is set)
  if (!process.env.AX_API_URL) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow health check
  if (pathname === "/up") {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = request.cookies.get("_ax_session")?.value;
  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
