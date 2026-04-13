import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";
import { listReposAsync } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { OrgSwitcher } from "@/components/org-switcher";

// Extract the first path segment as an org slug, but only if it looks like
// an org slug (lowercase, alphanumeric with hyphens) and isn't a known
// non-slug top-level route like /login, /settings, /docs, /onboarding, etc.
const NON_ORG_SEGMENTS = new Set([
  "login",
  "logout",
  "onboarding",
  "settings",
  "docs",
  "prs",
  "compare",
  "metrics",
  "invite",
  "auth",
  "api",
  "up",
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

export const metadata: Metadata = {
  title: "AX — Agentic Coding Metrics",
  description: "Measure how effectively you work with AI coding agents",
};

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
        <span className="text-white font-semibold text-sm tracking-tight">ax</span>
      </div>
      <span className="text-text-primary font-medium text-[15px] tracking-[-0.01em]">
        AX Metrics
      </span>
    </div>
  );
}

function NavLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors text-[13px] font-medium"
    >
      {icon}
      {children}
    </Link>
  );
}

const HomeIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
    <path
      d="M2.5 5.5L7.5 2L12.5 5.5V12.5H9.5V9C9.5 8.72 9.28 8.5 9 8.5H6C5.72 8.5 5.5 8.72 5.5 9V12.5H2.5V5.5Z"
      stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
    />
  </svg>
);

const PRIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
    <path
      d="M4.5 2.5V8.5M4.5 8.5C4.5 9.88 5.62 11 7 11H8M10.5 12.5V6.5M10.5 6.5C10.5 5.12 9.38 4 8 4H7"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    />
    <circle cx="4.5" cy="2" r="1.2" stroke="currentColor" strokeWidth="1" />
    <circle cx="10.5" cy="13" r="1.2" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const CompareIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
    <rect x="2" y="6" width="4" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="9" y="3" width="4" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const DocsIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
    <path
      d="M3 2.5H9.5L12 5V12C12 12.28 11.78 12.5 11.5 12.5H3C2.72 12.5 2.5 12.28 2.5 12V3C2.5 2.72 2.72 2.5 3 2.5Z"
      stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
    />
    <path d="M9.5 2.5V5H12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M5 8H10M5 10H8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

const SettingsIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
    <path
      d="M7.5 9.5a2 2 0 100-4 2 2 0 000 4z"
      stroke="currentColor" strokeWidth="1.2"
    />
    <path
      d="M12.3 9.2l-.7-.4a4.5 4.5 0 000-2.6l.7-.4a.5.5 0 00.2-.7l-.8-1.3a.5.5 0 00-.7-.2l-.7.4a4.5 4.5 0 00-2.2-1.3V2a.5.5 0 00-.5-.5H6.1a.5.5 0 00-.5.5v.7A4.5 4.5 0 003.4 4L2.7 3.6a.5.5 0 00-.7.2l-.7 1.3a.5.5 0 00.2.7l.7.4a4.5 4.5 0 000 2.6l-.7.4a.5.5 0 00-.2.7l.8 1.3a.5.5 0 00.7.2l.7-.4a4.5 4.5 0 002.2 1.3V13a.5.5 0 00.5.5h1.5a.5.5 0 00.5-.5v-.7a4.5 4.5 0 002.2-1.3l.7.4a.5.5 0 00.7-.2l.7-1.3a.5.5 0 00-.1-.7z"
      stroke="currentColor" strokeWidth="1.2"
    />
  </svg>
);

async function Sidebar() {
  const user = await getCurrentUser();

  // Resolve the current org slug from the request path.
  // Middleware injects x-pathname on every request; the root layout has no
  // direct access to route params, so we read it here.
  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname");
  const pathOrgSlug = parseOrgSlug(pathname);
  // Fall back to the user's first org when the current path has no slug
  // (e.g. /onboarding, /settings) — the sidebar still shows something useful.
  const orgSlug = pathOrgSlug ?? (user?.organizations[0]?.slug ?? null);

  // Nav link prefix: /{slug}
  const base = orgSlug ? `/${orgSlug}` : "";
  const overviewHref = base || "/";

  let repos: { id: number; github_owner: string | null; github_repo: string | null }[] = [];

  if (orgSlug) {
    try {
      repos = await listReposAsync(orgSlug);
    } catch {
      // API unreachable or org not found — leave empty
    }
  }

  const filteredRepos = repos.filter((r) => r.github_owner && r.github_repo);

  return (
    <aside className="w-[220px] h-screen flex flex-col border-r border-border-subtle bg-surface-0 flex-shrink-0">
      <div className="px-4 pt-5 pb-4">
        <Logo />
      </div>

      {/* Org switcher */}
      {user && user.organizations.length > 0 && (
        <div className="px-3 pb-3">
          <OrgSwitcher orgs={user.organizations} />
        </div>
      )}

      <nav className="flex-1 px-2.5 space-y-0.5">
        <NavLink href={overviewHref} icon={HomeIcon}>Overview</NavLink>
        <NavLink href={`${base}/prs`} icon={PRIcon}>Pull Requests</NavLink>
        <NavLink href={`${base}/compare`} icon={CompareIcon}>Compare</NavLink>
        <NavLink href={`${base}/settings`} icon={SettingsIcon}>Settings</NavLink>
        <NavLink href="/docs" icon={DocsIcon}>Docs</NavLink>
      </nav>

      {filteredRepos.length > 0 && (
        <div className="px-3 pb-4 pt-2 border-t border-border-subtle">
          <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">
            Filter by Repo
          </div>
          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
            <Link
              href={overviewHref}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              All repositories
            </Link>
            {filteredRepos.map((r) => (
              <Link
                key={r.id}
                href={`${overviewHref}?repo=${r.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-text-tertiary/30 flex-shrink-0" />
                <span className="truncate">
                  {r.github_owner}/{r.github_repo}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* User menu */}
      {user && (
        <div className="px-3 pb-4 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-2 px-2 py-1.5">
            {user.avatar_url && (
              <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full" />
            )}
            <span className="text-[12px] text-text-secondary truncate flex-1">
              {user.display_name || user.github_username}
            </span>
            <Link href="/settings" className="text-[10px] text-text-tertiary hover:text-text-primary">
              Settings
            </Link>
          </div>
        </div>
      )}
    </aside>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-[1200px] mx-auto px-8 py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
