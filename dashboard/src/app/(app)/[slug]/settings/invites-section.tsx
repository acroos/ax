"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

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
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `in ${days}d`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `in ${hours}h`;
}

export function InvitesSection({ invites: initialInvites, isAdmin, slug }: Props) {
  const [invites, setInvites] = useState(initialInvites);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("member");
  const [creating, setCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;

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
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
      <h2 className="text-sm font-medium text-text-primary">Invites</h2>

      {invites.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary font-medium">
                  @{inv.github_username}
                </div>
                <div className="text-[11px] text-text-tertiary">
                  {inv.role} &middot; expires {timeUntil(inv.expires_at)}
                </div>
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={revoking === inv.id}
                  className="px-2 py-1 rounded text-[11px] font-medium text-red hover:bg-red-muted transition-colors disabled:opacity-50"
                >
                  {revoking === inv.id ? "..." : "Revoke"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-tertiary">No pending invites.</p>
      )}

      {isAdmin && (
        <div className="border-t border-border-subtle pt-4 space-y-3">
          <h3 className="text-xs font-medium text-text-secondary">Invite a member</h3>
          <form onSubmit={handleCreate} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[11px] text-text-tertiary mb-1">
                GitHub username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="octocat"
                className="w-full bg-surface-0 border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-tertiary mb-1">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="bg-surface-0 border border-border-subtle rounded-md px-2 py-1.5 text-xs text-text-primary"
              >
                <option value="member">member</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={creating || !username.trim()}
              className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {creating ? "Sending..." : "Send Invite"}
            </button>
          </form>

          {error && (
            <p className="text-xs text-red">{error}</p>
          )}

          {inviteLink && (
            <div className="bg-surface-0 rounded-lg p-3 space-y-2">
              <p className="text-xs text-text-secondary">
                Invite created. Share this link:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-text-primary font-mono break-all select-all">
                  {inviteLink}
                </code>
                <CopyButton text={inviteLink} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
