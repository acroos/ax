"use server";

import { requestGithubInstallUrl, requestGitlabConnectUrl, disconnectGitlab } from "@/lib/db";

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

export async function disconnectGitlabAction(
  orgSlug: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    await disconnectGitlab(orgSlug);
    return { ok: true };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Failed to disconnect GitLab",
    };
  }
}
