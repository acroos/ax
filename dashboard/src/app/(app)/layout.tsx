import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import {
  BookOpen,
  CreditCard,
  GitPullRequest,
  Home,
  Settings,
  Users,
} from "lucide-react";

import { listReposAsync, listTeamsAsync } from "@/lib/db";
import type { Team } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { OrgSwitcher } from "@/components/org-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { MARKETING_SEGMENTS } from "@/lib/routes";

type RepoLite = {
  id: number;
  github_owner: string | null;
  github_repo: string | null;
};

// Extract the first path segment as an org slug, but only if it looks like
// an org slug (lowercase, alphanumeric with hyphens) and isn't a known
// non-slug top-level route like /login, /settings, /docs, /onboarding, etc.
const NON_ORG_SEGMENTS = new Set([
  "login",
  "logout",
  "onboarding",
  "settings",
  "prs",
  "invite",
  "auth",
  "api",
  "up",
  ...MARKETING_SEGMENTS,
]);

function parseOrgSlug(pathname: string | null): string | null {
  if (!pathname) return null;
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const first = segments[0];
  if (NON_ORG_SEGMENTS.has(first)) return null;
  // Basic sanity check — org slugs are lowercase kebab-ish
  if (!/^[a-z0-9][a-z0-9-]*$/.test(first)) return null;
  return first;
}

function SidebarBrand() {
  return (
    <Link
      href="/"
      aria-label="AX home"
      className="flex h-9 items-center gap-2 px-2 text-foreground"
    >
      <Logo variant="wordmark" className="h-5 w-auto" />
    </Link>
  );
}

function SidebarSkeletonContents() {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {Array.from({ length: 5 }).map((_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

async function AppSidebar() {
  // Resolve the current org slug from the request path. Middleware injects
  // x-pathname on every request; the layout has no direct access to route
  // params, so we read it here.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname");
  const activeRepoFilter = hdrs.get("x-repo-filter");
  const pathOrgSlug = parseOrgSlug(pathname);

  const reposPromise: Promise<RepoLite[]> = pathOrgSlug
    ? listReposAsync(pathOrgSlug).catch(() => [])
    : Promise.resolve([]);

  const teamsPromise: Promise<Team[]> = pathOrgSlug
    ? listTeamsAsync(pathOrgSlug).catch(() => [])
    : Promise.resolve([]);

  const [user, repos, teams] = await Promise.all([
    getCurrentUser(),
    reposPromise,
    teamsPromise,
  ]);

  // Fall back to the user's first org when the current path has no slug
  // (e.g. /onboarding, /settings) — the sidebar still shows something useful.
  const orgSlug = pathOrgSlug ?? user?.organizations[0]?.slug ?? null;
  const base = orgSlug ? `/${orgSlug}` : "";
  const overviewHref = base || "/";

  const filteredRepos = repos.filter((r) => r.github_owner && r.github_repo);

  // Teams are only available for Pro-plan orgs
  const currentOrg = user?.organizations.find((o) => o.slug === orgSlug);
  const isProPlan = currentOrg?.plan === "pro";
  const isPersonalOrg = currentOrg?.is_personal ?? false;
  const showTeams = isProPlan && !isPersonalOrg;

  // Build team sidebar labels — show parent prefix for nested teams, truncate at 7
  const MAX_SIDEBAR_TEAMS = 7;
  const teamLookup = Object.fromEntries(teams.map((t) => [t.slug, t]));
  function teamLabel(t: Team): string {
    if (t.parent_team_slug && teamLookup[t.parent_team_slug]) {
      return `${teamLookup[t.parent_team_slug].name} > ${t.name}`;
    }
    return t.name;
  }
  const visibleTeams = teams.slice(0, MAX_SIDEBAR_TEAMS);
  const hiddenTeamCount = teams.length - visibleTeams.length;

  const navItems = [
    { href: overviewHref, label: "Overview", icon: Home },
    { href: `${base}/prs`, label: "Pull Requests", icon: GitPullRequest },
    { href: `${base}/settings`, label: "Org Settings", icon: Settings },
    { href: `${base}/billing`, label: "Billing", icon: CreditCard },
    { href: "/docs", label: "Docs", icon: BookOpen },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarBrand />
        {user && user.organizations.length > 0 && (
          <OrgSwitcher
            orgs={user.organizations}
            currentSlug={orgSlug ?? undefined}
          />
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
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

        {showTeams && (
          <SidebarGroup>
            <SidebarGroupLabel>Teams</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="All Teams">
                    <Link href={`${base}/teams`}>
                      <Users />
                      <span>All Teams</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {visibleTeams.map((t) => (
                  <SidebarMenuItem key={t.slug}>
                    <SidebarMenuButton asChild tooltip={t.name}>
                      <Link href={`${base}/teams/${t.slug}`}>
                        <span className="truncate">{teamLabel(t)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {hiddenTeamCount > 0 && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link
                        href={`${base}/teams`}
                        className="text-muted-foreground"
                      >
                        <span>+{hiddenTeamCount} more...</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {teams.length === 0 && (
                  <SidebarMenuItem>
                    <span className="px-2 py-1 text-xs text-muted-foreground">
                      No teams yet
                    </span>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredRepos.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Filter by Repo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { id: null, label: "All repositories", href: overviewHref },
                  ...filteredRepos.map((r) => ({
                    id: String(r.id),
                    label: `${r.github_owner}/${r.github_repo}`,
                    href: `${overviewHref}?repo=${r.id}`,
                  })),
                ].map((item) => (
                  <SidebarMenuItem key={item.id ?? "all"}>
                    <SidebarMenuButton
                      asChild
                      isActive={(activeRepoFilter ?? null) === item.id}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <span className="truncate">{item.label}</span>
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
        {user && (
          <div className="flex items-center gap-2 px-2">
            <Avatar size="sm">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt="" />}
              <AvatarFallback>
                {(user.display_name || user.github_username || "?")
                  .charAt(0)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm text-sidebar-foreground">
              {user.display_name || user.github_username}
            </span>
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/settings" aria-label="Account settings">
                <Settings />
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        )}
        <Link
          href="/docs/data-collection"
          className="px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-sidebar-foreground"
        >
          Data &amp; Privacy
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Suspense fallback={<SidebarSkeletonContents />}>
        <AppSidebar />
      </Suspense>
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
