"use server";

import { requestGithubInstallUrl } from "@/lib/db";

export async function getInstallUrl(orgSlug: string): Promise<{ install_url?: string; error?: string }> {
  try {
    const result = await requestGithubInstallUrl(orgSlug);
    return { install_url: result.install_url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to generate install URL" };
  }
}
