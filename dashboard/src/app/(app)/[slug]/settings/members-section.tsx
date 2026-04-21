"use client";

import { useState } from "react";

import { toneClass, type Tone } from "@/components/state-badge";
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
  const tone: Tone =
    role === "owner" ? "notice" : role === "admin" ? "info" : "muted";
  return (
    <Badge variant="outline" className={toneClass(tone)}>
      {role}
    </Badge>
  );
}

export function MembersSection({
  members: initialMembers,
  currentUserId,
  isAdmin,
  slug,
}: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [updating, setUpdating] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{
    id: number;
    username: string;
  } | null>(null);

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
          prev.map((m) =>
            m.id === membershipId ? { ...m, role: newRole } : m,
          ),
        );
      }
    } finally {
      setUpdating(null);
    }
  }

  function handleRemove(membershipId: number, username: string) {
    setPendingRemove({ id: membershipId, username });
  }

  async function confirmRemove() {
    if (!pendingRemove) return;

    setPendingRemove(null);
    setRemoving(pendingRemove.id);
    try {
      const res = await fetch(
        `/api/v1/orgs/${slug}/members/${pendingRemove.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== pendingRemove.id));
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
              <div
                key={m.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
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
            <p className="py-3 text-xs text-muted-foreground">
              No members found.
            </p>
          )}
        </div>
        <AlertDialog
          open={!!pendingRemove}
          onOpenChange={(open) => {
            if (!open) setPendingRemove(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove member?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove{" "}
                <span className="font-medium text-foreground">
                  @{pendingRemove?.username}
                </span>{" "}
                from this organization? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Member</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={confirmRemove}>
                Remove Member
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
