import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { listReposAsync, listWatchStatusesAsync } from "@/lib/db";

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

async function Sidebar() {
  let repos: { id: number; github_owner: string | null; github_repo: string | null }[] = [];
  let watchedRepoIds = new Set<number>();
  try {
    repos = await listReposAsync();
    const watchStatuses = await listWatchStatusesAsync();
    watchedRepoIds = new Set(watchStatuses.map((w) => w.repo_id));
  } catch {
    // DB might not exist yet, or API not reachable
  }

  const filteredRepos = repos.filter((r) => r.github_owner && r.github_repo);

  return (
    <aside className="w-[220px] h-screen flex flex-col border-r border-border-subtle bg-surface-0 flex-shrink-0">
      <div className="px-4 pt-5 pb-4">
        <Logo />
      </div>

      <nav className="flex-1 px-2.5 space-y-0.5">
        <NavLink
          href="/"
          icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
              <path
                d="M2.5 5.5L7.5 2L12.5 5.5V12.5H9.5V9C9.5 8.72 9.28 8.5 9 8.5H6C5.72 8.5 5.5 8.72 5.5 9V12.5H2.5V5.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          }
        >
          Overview
        </NavLink>
        <NavLink
          href="/prs"
          icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
              <path
                d="M4.5 2.5V8.5M4.5 8.5C4.5 9.88 5.62 11 7 11H8M10.5 12.5V6.5M10.5 6.5C10.5 5.12 9.38 4 8 4H7"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="4.5" cy="2" r="1.2" stroke="currentColor" strokeWidth="1" />
              <circle cx="10.5" cy="13" r="1.2" stroke="currentColor" strokeWidth="1" />
            </svg>
          }
        >
          Pull Requests
        </NavLink>
        <NavLink
          href="/compare"
          icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
              <rect x="2" y="6" width="4" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
              <rect x="9" y="3" width="4" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          }
        >
          Compare
        </NavLink>
        <NavLink
          href="/docs"
          icon={
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="opacity-60">
              <path
                d="M3 2.5H9.5L12 5V12C12 12.28 11.78 12.5 11.5 12.5H3C2.72 12.5 2.5 12.28 2.5 12V3C2.5 2.72 2.72 2.5 3 2.5Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 2.5V5H12"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M5 8H10M5 10H8.5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
          }
        >
          Docs
        </NavLink>
      </nav>

      {filteredRepos.length > 0 && (
        <div className="px-3 pb-4 pt-2 border-t border-border-subtle">
          <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-2 px-1">
            Filter by Repo
          </div>
          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
            <Link
              href="/"
              className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              All repositories
            </Link>
            {filteredRepos.map((r) => (
              <Link
                key={r.id}
                href={`/?repo=${r.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${watchedRepoIds.has(r.id) ? "bg-green/60" : "bg-text-tertiary/30"}`} />
                <span className="truncate">
                  {r.github_owner}/{r.github_repo}
                </span>
                {watchedRepoIds.has(r.id) && (
                  <span className="text-[10px] text-text-tertiary ml-auto flex-shrink-0" title="Auto-polling enabled">
                    watching
                  </span>
                )}
              </Link>
            ))}
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
