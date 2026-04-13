import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.AX_API_URL || "http://localhost:3000";

export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("_ax_session")?.value;

  // Tell the Rails server to destroy the session record
  if (sessionToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { "X-Ax-Session": sessionToken },
    }).catch(() => {});
  }

  // Clear the session cookie on the dashboard side
  const res = NextResponse.json({ ok: true });
  res.cookies.set("_ax_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
