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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Invite {
  id: number;
  github_username: string;
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
  const [role, setRole] = useState("member");
  const [creating, setCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
    if (!username.trim()) return;

    if (seatPriceCents) {
      setConfirmOpen(true);
    } else {
      sendInvite();
    }
  }

  async function sendInvite() {
    setCreating(true);
    setError(null);
    setInviteLink(null);

    try {
      const res = await fetch(`/api/v1/orgs/${slug}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_username: username.trim(), role }),
      });

      if (res.ok) {
        const data = await res.json();
        setInviteLink(data.link);
        setUsername("");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to create invite");
      }
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

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
                    @{inv.github_username}
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
              Invite a member
            </h3>
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor="invite-username"
                  className="text-[11px] text-muted-foreground"
                >
                  GitHub username
                </Label>
                <Input
                  id="invite-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="octocat"
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
                disabled={creating || !username.trim()}
              >
                {creating ? "Sending..." : "Send Invite"}
              </Button>
            </form>

            {error && <p className="text-xs text-destructive">{error}</p>}

            {inviteLink && (
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">
                  Invite created. Share this link:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all break-all font-mono text-xs text-foreground">
                    {inviteLink}
                  </code>
                  <CopyButton text={inviteLink} />
                </div>
              </div>
            )}
          </div>
        )}

        {seatPriceCents && (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Add a paid seat?</AlertDialogTitle>
                <AlertDialogDescription>
                  When <span className="font-medium text-foreground">@{username.trim()}</span> accepts
                  this invite, a new seat will be added to your subscription
                  at {formatDollars(seatPriceCents)}/month (prorated).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => sendInvite()}
                >
                  Send Invite
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
