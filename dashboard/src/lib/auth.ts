import { cookies } from "next/headers";
import { isMock, mockUser } from "./mock";
import { fetchAPI } from "./db";

export interface CurrentUser {
  id: number;
  github_username: string | null;
  gitlab_username: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  organizations: {
    slug: string;
    name: string;
    is_personal: boolean;
    plan: string;
  }[];
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isMock) return mockUser;
  try {
    // Short-circuit when there's no session — avoids a wasted round-trip.
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("_ax_session")?.value;
    if (!sessionToken) return null;

    // Delegate to fetchAPI so this request shares the same connection pool,
    // keep-alive headers, and auth/timing instrumentation as all other API
    // calls. fetchAPI throws on non-OK responses; the catch below converts
    // that to null (unauthenticated).
    return await fetchAPI<CurrentUser>("/auth/me");
  } catch {
    return null;
  }
}

export function getOrgSlug(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z][a-z0-9-]*[a-z0-9])\//);
  return match ? match[1] : null;
}
