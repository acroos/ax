"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import type { TeamDetail, TeamMember } from "@/lib/db";

interface AvailableMember {
  org_membership_id: number;
  user: {
    id: number;
    github_username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface Props {
  slug: string;
  team: TeamDetail;
  availableMembers: AvailableMember[];
}

export function TeamEditForm({
  slug,
  team,
  availableMembers: initialAvailable,
}: Props) {
  const [name, setName] = useState(team.name);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>(team.members);
  const [available, setAvailable] = useState(initialAvailable);
  const [selectedMember, setSelectedMember] = useState("");
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/teams/${team.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to update team");
      router.refresh();
    } catch {
      // Could add error toast
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!selectedMember) return;
    setAdding(true);
    try {
      const res = await fetch(
        `/api/v1/orgs/${slug}/teams/${team.slug}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org_membership_id: parseInt(selectedMember, 10),
          }),
        },
      );
      if (!res.ok) throw new Error("Failed to add member");
      const newMember: TeamMember = await res.json();
      setMembers((prev) => [...prev, newMember]);
      setAvailable((prev) =>
        prev.filter((m) => String(m.org_membership_id) !== selectedMember),
      );
      setSelectedMember("");
      router.refresh();
    } catch {
      // Could add error toast
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(tm: TeamMember) {
    try {
      const res = await fetch(
        `/api/v1/orgs/${slug}/teams/${team.slug}/members/${tm.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to remove member");
      setMembers((prev) => prev.filter((m) => m.id !== tm.id));
      setAvailable((prev) => [
        ...prev,
        { org_membership_id: tm.org_membership_id, user: tm.user },
      ]);
      router.refresh();
    } catch {
      // Could add error toast
    }
  }

  return (
    <div className="space-y-6">
      {/* Team Details */}
      <Card className="p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-base font-semibold text-foreground">
            Team Details
          </h2>
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || name === team.name || !name.trim()}
              size="sm"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-base font-semibold text-foreground">
            Members ({members.length})
          </h2>

          {/* Add member */}
          {available.length > 0 && (
            <div className="flex gap-2">
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select an org member to add" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((m) => (
                    <SelectItem
                      key={m.org_membership_id}
                      value={String(m.org_membership_id)}
                    >
                      {m.user.display_name || m.user.github_username} (@
                      {m.user.github_username})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddMember}
                disabled={adding || !selectedMember}
                size="sm"
              >
                {adding ? "Adding..." : "Add"}
              </Button>
            </div>
          )}

          {/* Member list */}
          {members.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No members yet. Add org members to this team.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {members.map((tm) => (
                <div
                  key={tm.id}
                  className="flex items-center gap-3 py-2"
                >
                  <Avatar size="sm">
                    {tm.user.avatar_url && (
                      <AvatarImage src={tm.user.avatar_url} alt="" />
                    )}
                    <AvatarFallback>
                      {(tm.user.display_name || tm.user.github_username)
                        .charAt(0)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">
                      {tm.user.display_name || tm.user.github_username}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      @{tm.user.github_username}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveMember(tm)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
