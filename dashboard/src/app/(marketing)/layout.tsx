import Link from "next/link";

import { Logo, Mark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Separator } from "@/components/ui/separator";

const NAV_LINKS = [
  { href: "/docs", label: "Docs" },
  { href: "/plans", label: "Plans" },
  { href: "/setup", label: "Setup" },
  { href: "/changelog", label: "Changelog" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1100px] items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              aria-label="AX home"
              className="flex items-center text-foreground"
            >
              <Logo variant="wordmark" className="h-5 w-auto" />
            </Link>
            <NavigationMenu viewport={false}>
              <NavigationMenuList>
                {NAV_LINKS.map((item) => (
                  <NavigationMenuItem key={item.href}>
                    <NavigationMenuLink
                      asChild
                      className={navigationMenuTriggerStyle()}
                    >
                      <Link href={item.href}>{item.label}</Link>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
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

      <main className="flex-1">{children}</main>

      <footer>
        <Separator />
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-6 py-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mark className="h-4 w-4 text-foreground" title="" />
            <span>AX — Agentic Coding DX Metrics</span>
          </div>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/docs" className="transition-colors hover:text-foreground">
              Docs
            </Link>
            <Link
              href="/docs/data-collection"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <a
              href="https://github.com/acroos/ax"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <ThemeToggle />
          </nav>
        </div>
      </footer>
    </div>
  );
}
