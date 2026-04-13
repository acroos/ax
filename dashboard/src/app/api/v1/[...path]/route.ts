import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.AX_API_URL || "http://localhost:3000";

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  const search = request.nextUrl.search;
  const target = `${API_URL}/api/v1/${path.join("/")}${search}`;

  const headers: Record<string, string> = {};

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("_ax_session")?.value;
  if (sessionToken) {
    headers["X-Ax-Session"] = sessionToken;
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.text()
      : undefined;

  const res = await fetch(target, {
    method: request.method,
    headers,
    body,
  });

  const responseHeaders: Record<string, string> = {};
  const resContentType = res.headers.get("content-type");
  if (resContentType) {
    responseHeaders["Content-Type"] = resContentType;
  }

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
