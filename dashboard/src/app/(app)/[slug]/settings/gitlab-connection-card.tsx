"use client";

import { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";

import { getGitlabConnectUrl, disconnectGitlabAction } from "./actions";
import type { GitlabConnection } from "@/lib/db";
import { toneClass } from "@/components/state-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="shrink-0 transition-opacity hover:opacity-70"
      aria-label="Dismiss"
    >
      &times;
    </button>
  );
}

// GitLab's fox mark. Inline SVG for brand consistency — lucide-react
// doesn't include vendor logos. Color follows currentColor.
function GitLabMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 380 380"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="m190.08 349.44 69.87-215.14H120.2z" fill="#E24329" />
      <path d="m190.08 349.44-69.87-215.14H30.22z" fill="#FC6D26" />
      <path
        d="M30.22 134.3 4.33 213.84a17.66 17.66 0 0 0 6.42 19.75l179.33 130.27z"
        fill="#FCA326"
      />
      <path
        d="M30.22 134.3h89.99L83.15 11.73a8.88 8.88 0 0 0-16.89 0z"
        fill="#E24329"
      />
      <path d="m190.08 349.44 69.87-215.14h89.99z" fill="#FC6D26" />
      <path
        d="M349.94 134.3 375.83 213.84a17.66 17.66 0 0 1-6.42 19.75L190.08 363.86z"
        fill="#FCA326"
      />
      <path
        d="M349.94 134.3h-89.99l37.06-122.57a8.88 8.88 0 0 1 16.89 0z"
        fill="#E24329"
      />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state:
    "The connect link expired or was invalid. Please start over from settings.",
  token_exchange_failed:
    "Could not complete the GitLab OAuth flow. Please try again.",
  forbidden:
    "You do not have permission to connect GitLab for this organization.",
};

export function GitLabConnectionCard({
  slug,
  connection,
  isAdmin,
  connectedParam,
  errorParam,
}: {
  slug: string;
  connection: GitlabConnection | null;
  isAdmin: boolean;
  connectedParam?: string;
  errorParam?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(
    connectedParam === "true" || connectedParam === "false",
  );
  const [showRepos, setShowRepos] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Strip query params from URL after showing the banner
  useEffect(() => {
    if (connectedParam) {
      window.history.replaceState({}, "", `/${slug}/settings`);
    }
  }, [connectedParam, slug]);

  // Auto-dismiss success banner after 8 seconds
  useEffect(() => {
    if (showBanner && connectedParam === "true") {
      const timer = setTimeout(() => setShowBanner(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [showBanner, connectedParam]);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const result = await getGitlabConnectUrl(slug);
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (result.connect_url) {
        window.location.href = result.connect_url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      const result = await disconnectGitlabAction(slug);
      if (result.error) {
        setError(result.error);
      } else {
        setIsDisconnected(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  const isActive = connection?.status === "active" && !isDisconnected;
  const isSyncing = isActive && !connection?.last_synced_at;

  const errorMessage = errorParam
    ? ERROR_MESSAGES[errorParam] ||
      `${errorParam.replace(/_/g, " ")}. Please try again.`
    : null;

  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitLabMark className="size-4" />
            <h2 className="text-sm font-medium text-foreground">
              GitLab Integration
            </h2>
          </div>
          {isActive && (
            <Badge variant="outline" className={toneClass("success")}>
              Connected
            </Badge>
          )}
        </div>

        {/* Connect-result banner (success or failure) */}
        {showBanner && connectedParam === "true" && (
          <Alert className="border-success/25 bg-success/10 text-success">
            <AlertDescription className="flex items-start justify-between gap-2 text-success">
              <span>
                GitLab connected successfully. Webhook events will now flow
                into AX.
                {isSyncing && " Syncing recent MR history in the background..."}
              </span>
              <DismissButton onDismiss={() => setShowBanner(false)} />
            </AlertDescription>
          </Alert>
        )}

        {showBanner && connectedParam === "false" && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-start justify-between gap-2">
              <span>
                {errorMessage || "Connection failed. Please try again."}
              </span>
              <DismissButton onDismiss={() => setShowBanner(false)} />
            </AlertDescription>
          </Alert>
        )}

        {/* Inline error from connect URL fetch or disconnect */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* No connection */}
        {!isActive && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Connect your GitLab account to AX to automatically receive
              webhook events for merge requests and CI pipelines. This
              replaces manual{" "}
              <code className="text-[11px] text-foreground">ax push</code> for
              covered repos.
            </p>
            {isAdmin ? (
              <Button size="sm" onClick={handleConnect} disabled={loading}>
                {loading ? "Redirecting..." : "Connect GitLab"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ask an org admin or owner to connect GitLab.
              </p>
            )}
          </div>
        )}

        {/* Active connection */}
        {isActive && connection && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Account</span>
                <p className="mt-0.5 font-mono text-foreground">
                  {connection.account_username}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Repositories</span>
                <p className="mt-0.5 text-foreground">
                  {connection.repos_count} connected
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Connected</span>
                <p className="mt-0.5 text-foreground">
                  {connection.connected_at
                    ? new Date(connection.connected_at).toLocaleDateString()
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
                  ) : connection.last_synced_at ? (
                    formatRelativeTime(connection.last_synced_at)
                  ) : (
                    "Never"
                  )}
                </p>
              </div>
            </div>

            {/* Connected repos list */}
            {connection.repos.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRepos(!showRepos)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronRight
                    className={`size-3 transition-transform ${showRepos ? "rotate-90" : ""}`}
                    aria-hidden
                  />
                  {connection.repos.length} connected{" "}
                  {connection.repos.length === 1 ? "repo" : "repos"}
                </button>
                {showRepos && (
                  <ul className="mt-2 space-y-1 pl-4">
                    {connection.repos.map((repo) => (
                      <li
                        key={repo.id}
                        className="font-mono text-xs text-muted-foreground"
                      >
                        {repo.platform_owner}/{repo.platform_repo}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {isAdmin && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-attention hover:bg-attention/10 hover:text-attention"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
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
