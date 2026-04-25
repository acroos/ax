"use client";

import { useState } from "react";

import { CopyButton } from "@/components/copy-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Invite {
  id: number;
  github_username: string | null;
  gitlab_username: string | null;
  platform: "github" | "gitlab";
  role: string;
  expires_at: string;
}

interface Props {
  invites: Invite[];
  isAdmin: boolean;
  slug: string;
  /** Per-seat price in cents. Present only for Pro orgs with an active subscription. */
  seatPriceCents?: number;
}

interface InviteResult {
  username: string;
  link?: string;
  error?: string;
}

const BATCH_SIZE = 3;

function parseUsernames(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `in ${days}d`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `in ${hours}h`;
}

function formatDollars(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export function InvitesSection({
  invites: initialInvites,
  isAdmin,
  slug,
  seatPriceCents,
}: Props) {
  const [invites, setInvites] = useState(initialInvites);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [platform, setPlatform] = useState<"github" | "gitlab">("github");
  const [role, setRole] = useState("member");
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const usernames = parseUsernames(username);

  async function handleRevoke(inviteId: number) {
    setRevoking(inviteId);
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      }
    } finally {
      setRevoking(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usernames.length === 0) return;

    if (seatPriceCents) {
      setConfirmOpen(true);
    } else {
      sendInvites();
    }
  }

  async function createOneInvite(uname: string): Promise<InviteResult> {
    try {
      const body = platform === "gitlab"
        ? { gitlab_username: uname, platform: "gitlab", role }
        : { github_username: uname, platform: "github", role };
      const res = await fetch(`/api/v1/orgs/${slug}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        return { username: uname, link: data.link };
      }
      const data = await res.json().catch(() => null);
      return { username: uname, error: data?.error || "Failed to create invite" };
    } catch {
      return { username: uname, error: "Network error" };
    }
  }

  async function sendInvites() {
    setCreating(true);
    setError(null);
    setResults([]);

    const names = usernames;
    const total = names.length;
    setProgress({ done: 0, total });

    const allResults: InviteResult[] = [];

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = names.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(createOneInvite));
      allResults.push(...batchResults);
      setProgress({ done: Math.min(i + BATCH_SIZE, total), total });
    }

    setResults(allResults);
    setProgress(null);

    const failures = allResults.filter((r) => r.error);
    if (failures.length === total) {
      setError("All invites failed");
    } else if (failures.length > 0) {
      setError(`${failures.length} of ${total} invites failed`);
    }

    if (failures.length < total) {
      setUsername("");
    }
    setCreating(false);
  }

  const successResults = results.filter((r) => r.link);
  const failedResults = results.filter((r) => r.error);

  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <h2 className="text-sm font-medium text-foreground">Invites</h2>

        {invites.length > 0 ? (
          <div className="divide-y divide-border">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-foreground">
                    @{inv.github_username || inv.gitlab_username}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      ({inv.platform === "gitlab" ? "GitLab" : "GitHub"})
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {inv.role} &middot; expires {timeUntil(inv.expires_at)}
                  </div>
                </div>

                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(inv.id)}
                    disabled={revoking === inv.id}
                    className="text-attention hover:bg-attention/10 hover:text-attention"
                  >
                    {revoking === inv.id ? "..." : "Revoke"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No pending invites.</p>
        )}

        {isAdmin && (
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">
              Invite members
            </h3>
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <div className="space-y-1">
                <Label
                  htmlFor="invite-platform"
                  className="text-[11px] text-muted-foreground"
                >
                  Platform
                </Label>
                <Select value={platform} onValueChange={(v) => setPlatform(v as "github" | "gitlab")}>
                  <SelectTrigger id="invite-platform" size="sm" className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github" className="text-xs">
                      GitHub
                    </SelectItem>
                    <SelectItem value="gitlab" className="text-xs">
                      GitLab
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor="invite-username"
                  className="text-[11px] text-muted-foreground"
                >
                  {platform === "gitlab" ? "GitLab" : "GitHub"} usernames (comma-separated)
                </Label>
                <Input
                  id="invite-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={platform === "gitlab" ? "gitlab-user1, gitlab-user2" : "octocat, mona, hubot"}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label
                  htmlFor="invite-role"
                  className="text-[11px] text-muted-foreground"
                >
                  Role
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="invite-role" size="sm" className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member" className="text-xs">
                      member
                    </SelectItem>
                    <SelectItem value="admin" className="text-xs">
                      admin
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={creating || usernames.length === 0}
              >
                {creating
                  ? "Sending..."
                  : usernames.length > 1
                    ? `Send ${usernames.length} Invites`
                    : "Send Invite"}
              </Button>
            </form>

            {progress && (
              <div className="space-y-1.5">
                <Progress value={(progress.done / progress.total) * 100} />
                <p className="text-[11px] text-muted-foreground">
                  Sending invites... {progress.done}/{progress.total}
                </p>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            {successResults.length > 0 && (
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">
                  {successResults.length === 1
                    ? "Invite created. Share this link:"
                    : `${successResults.length} invites created. Share these links:`}
                </p>
                {successResults.map((r) => (
                  <div key={r.username} className="space-y-0.5">
                    {successResults.length > 1 && (
                      <p className="text-[11px] font-medium text-foreground">
                        @{r.username}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <code className="flex-1 select-all break-all font-mono text-xs text-foreground">
                        {r.link}
                      </code>
                      <CopyButton text={r.link!} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {failedResults.length > 0 && (
              <div className="space-y-1 rounded-lg bg-destructive/5 p-3">
                {failedResults.map((r) => (
                  <p key={r.username} className="text-xs text-destructive">
                    @{r.username}: {r.error}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {seatPriceCents && (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {usernames.length > 1
                    ? `Add ${usernames.length} paid seats?`
                    : "Add a paid seat?"}
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    {usernames.length > 1 ? (
                      <>
                        <p>
                          When these {usernames.length} members accept their invites,
                          new seats will be added to your subscription
                          at {formatDollars(seatPriceCents)}/seat/month (prorated).
                        </p>
                        <p className="mt-2 font-medium text-foreground">
                          Total: {formatDollars(seatPriceCents * usernames.length)}/month
                        </p>
                      </>
                    ) : (
                      <p>
                        When <span className="font-medium text-foreground">@{usernames[0]}</span> accepts
                        this invite, a new seat will be added to your subscription
                        at {formatDollars(seatPriceCents)}/month (prorated).
                      </p>
                    )}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => sendInvites()}>
                  {usernames.length > 1
                    ? `Send ${usernames.length} Invites`
                    : "Send Invite"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
