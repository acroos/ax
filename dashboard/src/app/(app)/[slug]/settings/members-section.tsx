"use client";

import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const classes: Record<string, string> = {
    owner: "bg-notice/15 text-notice border-notice/25",
    admin: "bg-info/15 text-info border-info/25",
    member: "bg-muted text-muted-foreground border-border",
  };
  const variantClass =
    classes[role] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={variantClass}>
      {role}
    </Badge>
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
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <h2 className="text-sm font-medium text-foreground">Members</h2>

        <div className="divide-y divide-border">
          {members.map((m) => {
            const isSelf = m.user.id === currentUserId;
            return (
              <div key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar size="sm">
                  {m.user.avatar_url && (
                    <AvatarImage src={m.user.avatar_url} alt="" />
                  )}
                  <AvatarFallback>
                    {(m.user.display_name || m.user.github_username)
                      .charAt(0)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {m.user.display_name || m.user.github_username}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    @{m.user.github_username}
                  </div>
                </div>

                {isAdmin && !isSelf ? (
                  <Select
                    value={m.role}
                    onValueChange={(value) => handleRoleChange(m.id, value)}
                    disabled={updating === m.id}
                  >
                    <SelectTrigger size="sm" className="w-[110px] text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-[11px]">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <RoleBadge role={m.role} />
                )}

                {isAdmin && !isSelf && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(m.id, m.user.github_username)}
                    disabled={removing === m.id}
                    className="text-attention hover:bg-attention/10 hover:text-attention"
                  >
                    {removing === m.id ? "..." : "Remove"}
                  </Button>
                )}
              </div>
            );
          })}

          {members.length === 0 && (
            <p className="py-3 text-xs text-muted-foreground">No members found.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
