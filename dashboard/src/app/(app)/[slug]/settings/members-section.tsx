"use client";

import { useState } from "react";

export interface Member {
  id: number;
  role: string;
  joined_at: string;
  user: {
    id: number;
    github_username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface Props {
  members: Member[];
  currentUserId: number;
  isAdmin: boolean;
  slug: string;
}

const ROLES = ["member", "admin", "owner"] as const;

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    owner: "text-amber bg-amber-muted",
    admin: "text-purple bg-purple-muted",
    member: "text-text-secondary bg-surface-2",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${colors[role] || colors.member}`}>
      {role}
    </span>
  );
}

export function MembersSection({ members: initialMembers, currentUserId, isAdmin, slug }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [updating, setUpdating] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  async function handleRoleChange(membershipId: number, newRole: string) {
    setUpdating(membershipId);
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/members/${membershipId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.id === membershipId ? { ...m, role: newRole } : m))
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  async function handleRemove(membershipId: number, username: string) {
    if (!confirm(`Remove ${username} from this organization?`)) return;

    setRemoving(membershipId);
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/members/${membershipId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== membershipId));
      }
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
      <h2 className="text-sm font-medium text-text-primary">Members</h2>

      <div className="divide-y divide-border-subtle">
        {members.map((m) => {
          const isSelf = m.user.id === currentUserId;
          return (
            <div key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              {m.user.avatar_url ? (
                <img
                  src={m.user.avatar_url}
                  alt=""
                  className="w-7 h-7 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-surface-3 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary font-medium truncate">
                  {m.user.display_name || m.user.github_username}
                </div>
                <div className="text-[11px] text-text-tertiary truncate">
                  @{m.user.github_username}
                </div>
              </div>

              {isAdmin && !isSelf ? (
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  disabled={updating === m.id}
                  className="bg-surface-2 border border-border-subtle rounded px-2 py-1 text-[11px] text-text-primary disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              ) : (
                <RoleBadge role={m.role} />
              )}

              {isAdmin && !isSelf && (
                <button
                  onClick={() => handleRemove(m.id, m.user.github_username)}
                  disabled={removing === m.id}
                  className="px-2 py-1 rounded text-[11px] font-medium text-red hover:bg-red-muted transition-colors disabled:opacity-50"
                >
                  {removing === m.id ? "..." : "Remove"}
                </button>
              )}
            </div>
          );
        })}

        {members.length === 0 && (
          <p className="text-xs text-text-tertiary py-3">No members found.</p>
        )}
      </div>
    </div>
  );
}
