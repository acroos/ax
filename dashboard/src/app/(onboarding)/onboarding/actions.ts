"use server";

import { cookies } from "next/headers";
import { requestGithubInstallUrl, requestGitlabConnectUrl } from "@/lib/db";

const API_URL = process.env.AX_API_URL || "http://localhost:3000";

export async function getInstallUrl(
  orgSlug: string,
): Promise<{ install_url?: string; error?: string }> {
  try {
    const result = await requestGithubInstallUrl(orgSlug);
    return { install_url: result.install_url };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to generate install URL",
    };
  }
}

export async function getGitlabConnectUrl(
  orgSlug: string,
): Promise<{ connect_url?: string; error?: string }> {
  try {
    const result = await requestGitlabConnectUrl(orgSlug);
    return { connect_url: result.connect_url };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to generate connect URL",
    };
  }
}

export async function createInvite(
  orgSlug: string,
  githubUsername: string,
  role: string,
): Promise<{ link?: string; error?: string }> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("_ax_session")?.value;

    const res = await fetch(
      `${API_URL}/api/v1/orgs/${encodeURIComponent(orgSlug)}/invites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { "X-Ax-Session": sessionToken } : {}),
        },
        body: JSON.stringify({ github_username: githubUsername, role }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { error: data?.error || `Failed to create invite (${res.status})` };
    }

    const data = await res.json();
    return { link: data.link };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to create invite",
    };
  }
}
