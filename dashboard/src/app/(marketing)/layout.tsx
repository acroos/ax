import Link from "next/link";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
        <span className="text-white font-semibold text-sm tracking-tight">ax</span>
      </div>
      <span className="text-text-primary font-medium text-[15px] tracking-[-0.01em]">
        AX
      </span>
    </Link>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-text-secondary hover:text-text-primary transition-colors text-[13px] font-medium"
    >
      {children}
    </Link>
  );
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-border-subtle bg-surface-0/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="flex items-center gap-6">
              <NavLink href="/docs">Docs</NavLink>
              <NavLink href="/plans">Plans</NavLink>
              <NavLink href="/setup">Setup</NavLink>
              <NavLink href="/changelog">Changelog</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-[13px] font-medium px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border-subtle">
        <div className="max-w-[1100px] mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
            <div className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center">
              <span className="text-accent font-semibold text-[9px]">ax</span>
            </div>
            AX — Agentic Coding DX Metrics
          </div>
          <nav className="flex items-center gap-5 text-[12px] text-text-tertiary">
            <Link href="/docs" className="hover:text-text-secondary transition-colors">Docs</Link>
            <Link href="/docs/data-collection" className="hover:text-text-secondary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-text-secondary transition-colors">Terms</Link>
            <a
              href="https://github.com/acroos/ax"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text-secondary transition-colors"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
