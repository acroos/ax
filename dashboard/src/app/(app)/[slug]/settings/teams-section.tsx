"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Team } from "@/lib/db";

interface Props {
  teams: Team[];
  isAdmin: boolean;
  slug: string;
}

export function TeamsSection({ teams: initialTeams, isAdmin, slug }: Props) {
  const [teams, setTeams] = useState(initialTeams);
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<Team | null>(null);
  const [createName, setCreateName] = useState("");
  const [createParent, setCreateParent] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleCreate() {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const body: Record<string, string> = { name: createName.trim() };
      if (createParent) body.parent_team_slug = createParent;
      const res = await fetch(`/api/v1/orgs/${slug}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create team");
      const newTeam: Team = await res.json();
      setTeams((prev) => [...prev, newTeam]);
      setShowCreate(false);
      setCreateName("");
      setCreateParent("");
      router.refresh();
    } catch {
      // Could add error toast here
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(team: Team) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/orgs/${slug}/teams/${team.slug}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete team");
      setTeams((prev) => prev.filter((t) => t.slug !== team.slug));
      setShowDelete(null);
      router.refresh();
    } catch {
      // Could add error toast here
    } finally {
      setDeleting(false);
    }
  }

  // Build indented tree structure
  const topLevel = teams.filter((t) => !t.parent_team_slug);
  const childrenOf = (parentSlug: string) =>
    teams.filter((t) => t.parent_team_slug === parentSlug);

  function renderTeamRow(team: Team, depth: number) {
    const children = childrenOf(team.slug);
    return (
      <div key={team.slug}>
        <div
          className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/50"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          <span className="flex-1 text-sm font-medium text-foreground">
            {team.name}
          </span>
          <span className="text-xs text-muted-foreground">
            {team.member_count} member{team.member_count !== 1 ? "s" : ""}
          </span>
          {isAdmin && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/${slug}/settings/teams/${team.slug}`}>Edit</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowDelete(team)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
        {children.map((child) => renderTeamRow(child, depth + 1))}
      </div>
    );
  }

  const descendantCount = (team: Team): number => {
    const children = childrenOf(team.slug);
    return children.reduce((sum, c) => sum + 1 + descendantCount(c), 0);
  };

  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Teams</h2>
            <p className="text-sm text-muted-foreground">
              Organize members into teams for scoped metrics
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + Create Team
            </Button>
          )}
        </div>

        {teams.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No teams yet. Create a team to group members and view scoped
            metrics.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {topLevel.map((team) => renderTeamRow(team, 0))}
          </div>
        )}
      </CardContent>

      {/* Create Team Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
            <DialogDescription>
              Create a new team within this organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Frontend"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent-team">Parent team (optional)</Label>
              <Select value={createParent} onValueChange={setCreateParent}>
                <SelectTrigger id="parent-team">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.slug} value={t.slug}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Team Dialog */}
      <Dialog
        open={showDelete !== null}
        onOpenChange={(open) => !open && setShowDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {showDelete && (
            <div className="py-2 text-sm text-foreground">
              <p>
                This will permanently delete{" "}
                <strong>{showDelete.name}</strong>
                {descendantCount(showDelete) > 0 && (
                  <>
                    {" "}
                    and{" "}
                    <strong>
                      {descendantCount(showDelete)} child team
                      {descendantCount(showDelete) !== 1 ? "s" : ""}
                    </strong>
                  </>
                )}
                . Team members will keep their org membership.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDelete && handleDelete(showDelete)}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Team"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
