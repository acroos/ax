import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function DemoNotFound() {
  return (
    <div className="flex flex-col items-center py-24">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
        404
      </p>
      <h1 className="mt-2 font-serif text-[28px] leading-tight text-foreground">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-center text-muted-foreground">
        This page doesn&rsquo;t exist or you may not have access to it.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Button asChild>
          <Link href="/demo">Go to overview</Link>
        </Button>
      </div>
    </div>
  );
}
