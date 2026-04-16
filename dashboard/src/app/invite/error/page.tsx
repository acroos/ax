import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MESSAGES: Record<string, { title: string; body: string }> = {
  expired: {
    title: "Invite unavailable",
    body: "This invite has expired, been revoked, or was already used. Ask whoever sent it to issue a new one.",
  },
  network: {
    title: "Couldn't reach the server",
    body: "We couldn't talk to the AX API to accept this invite. Please try again in a moment.",
  },
  unknown: {
    title: "Couldn't accept invite",
    body: "Something went wrong accepting this invite. Please try again, or ask whoever sent it to issue a new one.",
  },
};

export default async function InviteErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const msg = MESSAGES[reason ?? "unknown"] ?? MESSAGES.unknown;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Badge className="bg-attention text-attention-foreground">
            Heads up
          </Badge>
          <CardTitle className="mt-2 font-serif text-xl font-semibold">
            {msg.title}
          </CardTitle>
          <CardDescription>{msg.body}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button variant="outline" asChild>
            <Link href="/">Continue to dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
