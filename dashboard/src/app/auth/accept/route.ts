import { NextRequest, NextResponse } from "next/server";

// Cross-origin auth handoff endpoint.
//
// The Rails API on a different origin cannot set cookies on the dashboard's
// domain, so after a successful GitHub sign-in it redirects here with the
// session token in the query string. This route sets _ax_session as an
// HttpOnly cookie on the dashboard's own domain and immediately redirects to
// the intended destination so the token does not linger in the browser URL.
//
// This is a stopgap. Once the dashboard and API share a parent domain we will
// delete this route and have Rails set the cookie directly with a domain
// attribute. See project memory: managed_auth_domain.
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const nextParam = searchParams.get("next") || "/";

  // Only allow relative next paths so this cannot be used as an open redirect.
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // If the user was mid-invite when they hit /login, honor that intent
  // instead of the default next destination. The invite page reads the
  // cookie and clears it once the invite is successfully accepted.
  const pendingInvite = req.cookies.get("pending_invite")?.value;
  const destination = pendingInvite
    ? `/invite/${encodeURIComponent(pendingInvite)}`
    : safeNext;

  const res = NextResponse.redirect(new URL(destination, req.url));
  res.cookies.set("_ax_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
