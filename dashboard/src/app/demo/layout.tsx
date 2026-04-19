import Link from "next/link";
import { BookOpen, GitPullRequest, Home, Users } from "lucide-react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { MOCK_REPOS, MOCK_TEAMS } from "@/lib/mock/data";

const NAV_ITEMS = [
  { href: "/demo", label: "Overview", icon: Home },
  { href: "/demo/prs", label: "Pull Requests", icon: GitPullRequest },
  { href: "/docs", label: "Docs", icon: BookOpen },
];

const DEMO_REPOS = MOCK_REPOS.filter((r) => r.github_owner && r.github_repo);

function SidebarBrand() {
  return (
    <Link
      href="/demo"
      aria-label="AX demo"
      className="flex h-9 items-center gap-2 px-2 text-foreground"
    >
      <Logo variant="wordmark" className="h-5 w-auto" />
    </Link>
  );
}

function DemoSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarBrand />
        <div className="px-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
            <span className="flex-1 truncate text-sm font-medium text-foreground">
              Acme Engineering
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Teams</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="All Teams">
                  <Link href="/demo/teams">
                    <Users />
                    <span>All Teams</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {MOCK_TEAMS.map((t) => {
                const parentName = t.parent_team_slug
                  ? MOCK_TEAMS.find((p) => p.slug === t.parent_team_slug)?.name
                  : null;
                return (
                  <SidebarMenuItem key={t.slug}>
                    <SidebarMenuButton asChild tooltip={t.name}>
                      <Link href={`/demo/teams/${t.slug}`}>
                        <span className="truncate">
                          {parentName ? `${parentName} > ${t.name}` : t.name}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {DEMO_REPOS.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Filter by Repo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="All repositories">
                    <Link href="/demo">
                      <span className="truncate">All repositories</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {DEMO_REPOS.map((r) => (
                  <SidebarMenuItem key={r.id}>
                    <SidebarMenuButton asChild tooltip={`${r.github_owner}/${r.github_repo}`}>
                      <Link href={`/demo?repo=${r.id}`}>
                        <span className="truncate">
                          {r.github_owner}/{r.github_repo}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-2">
          <Badge variant="secondary" className="text-xs">
            Demo Mode
          </Badge>
          <ThemeToggle />
        </div>
        <div className="px-2 py-1">
          <Link
            href="/login"
            className="text-xs text-primary transition-colors hover:underline"
          >
            Sign in to use AX →
          </Link>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <DemoSidebar />
      <SidebarInset>
        <div className="flex items-center border-b border-border px-4 py-2 md:hidden">
          <SidebarTrigger />
        </div>
        <main className="mx-auto w-full max-w-[1200px] px-8 py-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
