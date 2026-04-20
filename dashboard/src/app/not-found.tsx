import Link from "next/link";

import { Logo, Mark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <Link
            href="/"
            aria-label="AX home"
            className="flex items-center text-foreground"
          >
            <Logo variant="wordmark" className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 font-serif text-[40px] leading-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-3 max-w-md text-center text-muted-foreground">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been
          moved.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/docs">Browse docs</Link>
          </Button>
        </div>
      </main>

      <footer>
        <Separator />
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mark className="h-4 w-4 text-foreground" title="" />
            <span>AX — Agentic Coding DX Metrics</span>
          </div>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link
              href="/docs"
              className="transition-colors hover:text-foreground"
            >
              Docs
            </Link>
            <Link
              href="/docs/data-collection"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </footer>
    </div>
  );
}
