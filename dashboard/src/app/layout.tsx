import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { listRepos } from "@/lib/db";

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

function Sidebar() {
  let repos: { id: number; github_owner: string | null; github_repo: string | null }[] = [];
  try {
    repos = listRepos();
  } catch {
    // DB might not exist yet
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
                <div className="w-1.5 h-1.5 rounded-full bg-green/60 flex-shrink-0" />
                <span className="truncate">
                  {r.github_owner}/{r.github_repo}
                </span>
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
