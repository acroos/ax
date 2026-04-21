"use client";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center py-24">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        Error
      </p>
      <h1 className="mt-2 font-serif text-[28px] leading-tight text-foreground">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-center text-muted-foreground">
        An unexpected error occurred. Try refreshing to get back on track.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
