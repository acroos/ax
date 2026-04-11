import { cookies } from "next/headers";

const API_URL = process.env.AX_API_URL || "http://localhost:3000";

export interface CurrentUser {
  id: number;
  github_username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  organizations: { slug: string; name: string; is_personal: boolean }[];
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isAPIMode()) return null;

  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("_ax_session")?.value;
    if (!sessionToken) return null;

    const res = await fetch(`${API_URL}/auth/me`, {
      headers: {
        "X-Ax-Session": sessionToken,
      },
      cache: "no-store",
    });

    if (!res.ok) return null;
    return (await res.json()) as CurrentUser;
  } catch {
    return null;
  }
}

export function isAPIMode(): boolean {
  return !!process.env.AX_API_URL;
}

export function getOrgSlug(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z][a-z0-9-]*[a-z0-9])\//);
  return match ? match[1] : null;
}
