import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.AX_API_URL || "http://localhost:3000";

// Invite landing endpoint. Two cases:
//   1. User has an active session → POST to Rails to accept the invite and
//      redirect to the org page. On any failure, redirect to /invite/error
//      so the user sees a friendly message.
//   2. No session → stash the token in a pending_invite cookie on this
//      domain (1h) and redirect to /login. After sign-in, /auth/accept
//      consumes the cookie and redirects here again, landing in case 1.
//
// This is a Route Handler (not a Server Component) specifically so we can
// call cookies().set() / .delete() — server components cannot mutate cookies.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const sessionToken = req.cookies.get("_ax_session")?.value;

  if (!sessionToken) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set("pending_invite", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });
    return res;
  }

  let apiRes: Response;
  try {
    apiRes = await fetch(
      `${API_URL}/api/v1/invites/${encodeURIComponent(token)}/accept`,
      {
        method: "POST",
        headers: {
          "X-Ax-Session": sessionToken,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
  } catch {
    const res = NextResponse.redirect(
      new URL("/invite/error?reason=network", req.url),
    );
    res.cookies.delete("pending_invite");
    return res;
  }

  if (!apiRes.ok) {
    const reason = apiRes.status === 404 ? "expired" : "unknown";
    const res = NextResponse.redirect(
      new URL(`/invite/error?reason=${reason}`, req.url),
    );
    res.cookies.delete("pending_invite");
    return res;
  }

  const data = (await apiRes.json()) as { org_slug: string };
  const res = NextResponse.redirect(new URL(`/${data.org_slug}`, req.url));
  res.cookies.delete("pending_invite");
  return res;
}
