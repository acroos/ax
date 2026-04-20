"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function DeleteOrgSection({
  slug,
  orgName,
}: {
  slug: string;
  orgName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/v1/orgs/${slug}`, { method: "DELETE" });

    if (res.ok) {
      router.push("/");
      return;
    }

    const body = await res.json().catch(() => null);
    setError(body?.error || "Something went wrong. Please try again.");
    setDeleting(false);
  }

  return (
    <>
      <Card className="border-destructive/30 p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-sm font-medium text-destructive">
            Delete Organization
          </h2>
          <p className="text-xs text-muted-foreground">
            Permanently delete this organization and all of its data including
            repositories, pull requests, sessions, and metrics. This action
            cannot be undone.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            Delete organization
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!deleting) {
            setOpen(o);
            setConfirmation("");
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-foreground">
            <p>
              This will permanently delete <strong>{orgName}</strong> and all
              associated data including repositories, PRs, sessions, and metrics.
              All members will lose access.
            </p>
            <div>
              <label
                htmlFor="confirm-slug"
                className="text-xs text-muted-foreground"
              >
                Type <span className="font-mono font-medium">{slug}</span> to
                confirm
              </label>
              <Input
                id="confirm-slug"
                className="mt-1"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={slug}
                disabled={deleting}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmation !== slug}
            >
              {deleting ? "Deleting..." : "Delete organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
