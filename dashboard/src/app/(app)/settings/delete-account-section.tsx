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

export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const res = await fetch("/api/v1/account", { method: "DELETE" });

    if (res.ok) {
      // Clear session cookie and redirect to login
      await fetch("/auth/logout", { method: "POST" }).catch(() => {});
      router.push("/login");
      return;
    }

    const body = await res.json().catch(() => null);

    if (res.status === 409 && body?.organizations) {
      const orgNames = body.organizations
        .map((o: { name: string }) => o.name)
        .join(", ");
      setError(
        `You are the sole owner of: ${orgNames}. Transfer ownership before deleting your account.`,
      );
    } else {
      setError("Something went wrong. Please try again.");
    }

    setDeleting(false);
  }

  return (
    <>
      <Card className="border-destructive/30 p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-sm font-medium text-destructive">
            Delete Account
          </h2>
          <p className="text-xs text-muted-foreground">
            Permanently delete your account, sessions, and API keys. Your
            authored PRs and commits will be anonymized. This action cannot be
            undone.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            Delete account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => !deleting && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-foreground space-y-2">
            <p>This will permanently:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Delete your account and personal organization</li>
              <li>Revoke all API keys and sessions</li>
              <li>Remove you from all organizations</li>
              <li>Anonymize your name on authored PRs and commits</li>
            </ul>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
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
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
