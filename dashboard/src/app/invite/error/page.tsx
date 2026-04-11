import Link from "next/link";

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
    <div className="min-h-screen flex items-center justify-center bg-void">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold text-text-primary">{msg.title}</h1>
        <p className="text-sm text-text-secondary">{msg.body}</p>
        <Link href="/" className="text-accent text-sm hover:underline">
          Continue to dashboard
        </Link>
      </div>
    </div>
  );
}
