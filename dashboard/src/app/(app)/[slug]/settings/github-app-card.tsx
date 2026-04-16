"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";

import { getInstallUrl } from "./actions";
import type { GithubInstallation } from "@/lib/db";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// GitHub's brand mark. lucide-react dropped branded logos for trademark
// reasons, so we inline the octocat. Color follows currentColor.
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_installation_id: "GitHub did not return an installation ID. Please try installing again.",
  api_error: "Could not verify the installation with GitHub. Please try again.",
  invalid_state: "The install link expired or was invalid. Please start over from settings.",
  forbidden: "You do not have permission to install the GitHub App for this organization.",
};

export function GitHubAppCard({
  slug,
  installation,
  isAdmin,
  installedParam,
  errorParam,
}: {
  slug: string;
  installation: GithubInstallation | null;
  isAdmin: boolean;
  installedParam?: string;
  errorParam?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(
    installedParam === "true" || installedParam === "false"
  );
  const [showRepos, setShowRepos] = useState(false);

  // Strip query params from URL after showing the banner
  useEffect(() => {
    if (installedParam) {
      window.history.replaceState({}, "", `/${slug}/settings`);
    }
  }, [installedParam, slug]);

  // Auto-dismiss success banner after 8 seconds
  useEffect(() => {
    if (showBanner && installedParam === "true") {
      const timer = setTimeout(() => setShowBanner(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [showBanner, installedParam]);

  async function handleInstall() {
    setLoading(true);
    setError(null);
    try {
      const result = await getInstallUrl(slug);
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (result.install_url) {
        window.location.href = result.install_url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  const isActive = installation?.status === "active";
  const isSuspended = installation?.status === "suspended";
  const isSyncing = isActive && !installation?.last_synced_at;
  const installationSettingsUrl = installation
    ? `https://github.com/settings/installations/${installation.github_installation_id}`
    : null;

  const errorMessage = errorParam
    ? ERROR_MESSAGES[errorParam] || `${errorParam.replace(/_/g, " ")}. Please try again.`
    : null;

  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitHubMark className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">
              GitHub App Integration
            </h2>
          </div>
          {isActive && (
            <Badge className="bg-success/15 text-success border-success/20" variant="outline">
              Connected
            </Badge>
          )}
          {isSuspended && (
            <Badge className="bg-notice/15 text-notice border-notice/25" variant="outline">
              Suspended
            </Badge>
          )}
        </div>

        {/* Success banner */}
        {showBanner && installedParam === "true" && (
          <Alert className="border-success/25 bg-success/10 text-success">
            <AlertDescription className="text-success">
              <div className="flex items-start justify-between gap-2">
                <span>
                  GitHub App installed successfully. Webhook events will now flow into AX.
                  {isSyncing && " Syncing recent PR history in the background..."}
                </span>
                <button
                  onClick={() => setShowBanner(false)}
                  className="shrink-0 transition-opacity hover:opacity-70"
                  aria-label="Dismiss"
                >
                  &times;
                </button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Error banner */}
        {showBanner && installedParam === "false" && (
          <Alert variant="destructive">
            <AlertDescription>
              <div className="flex items-start justify-between gap-2">
                <span>{errorMessage || "Installation failed. Please try again."}</span>
                <button
                  onClick={() => setShowBanner(false)}
                  className="shrink-0 transition-opacity hover:opacity-70"
                  aria-label="Dismiss"
                >
                  &times;
                </button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Inline error from install URL fetch */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* No installation */}
        {!installation && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Connect your GitHub organization to AX to automatically receive webhook
              events for pull requests, reviews, and CI results. This replaces manual{" "}
              <code className="text-[11px] text-foreground">ax push</code> for covered repos.
            </p>
            {isAdmin ? (
              <Button size="sm" onClick={handleInstall} disabled={loading}>
                {loading ? "Redirecting..." : "Install GitHub App"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ask an org admin or owner to install the GitHub App.
              </p>
            )}
          </div>
        )}

        {/* Active installation */}
        {isActive && installation && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Account</span>
                <p className="mt-0.5 font-mono text-foreground">{installation.account_login}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Repositories</span>
                <p className="mt-0.5 text-foreground">
                  {installation.repository_selection === "all"
                    ? "All repositories"
                    : `${installation.repos_count} selected`}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Installed</span>
                <p className="mt-0.5 text-foreground">
                  {installation.installed_at
                    ? new Date(installation.installed_at).toLocaleDateString()
                    : "Unknown"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Last synced</span>
                <p className="mt-0.5 text-foreground">
                  {isSyncing ? (
                    <span className="inline-flex items-center gap-1.5 text-primary">
                      <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
                      Syncing...
                    </span>
                  ) : installation.last_synced_at ? (
                    formatRelativeTime(installation.last_synced_at)
                  ) : (
                    "Never"
                  )}
                </p>
              </div>
            </div>

            {/* Connected repos list */}
            {installation.repos.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRepos(!showRepos)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRight
                    className={`size-3 transition-transform ${showRepos ? "rotate-90" : ""}`}
                    aria-hidden
                  />
                  {installation.repos.length} connected {installation.repos.length === 1 ? "repo" : "repos"}
                </button>
                {showRepos && (
                  <ul className="mt-2 space-y-1 pl-4">
                    {installation.repos.map((repo) => (
                      <li key={repo.id} className="font-mono text-xs text-muted-foreground">
                        {repo.github_owner}/{repo.github_repo}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isAdmin && installationSettingsUrl && (
              <a
                href={installationSettingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Manage on GitHub
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
        )}

        {/* Suspended installation */}
        {isSuspended && installation && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              The GitHub App installation for{" "}
              <span className="font-mono text-notice">{installation.account_login}</span>{" "}
              is suspended. Webhook events are paused.
            </p>
            {isAdmin ? (
              <div className="flex items-center gap-2">
                {installationSettingsUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a
                      href={installationSettingsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Resume on GitHub
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleInstall}
                  disabled={loading}
                >
                  {loading ? "Redirecting..." : "Reinstall"}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ask an org admin to resume the installation on GitHub.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
