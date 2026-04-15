import Link from "next/link";

export default function SetupPage() {
  return (
    <div className="max-w-[760px] mx-auto px-6 py-20">
      <div className="mb-12">
        <h1 className="text-[28px] font-semibold text-text-primary mb-3">
          Getting Started
        </h1>
        <p className="text-[15px] text-text-secondary max-w-[520px]">
          Connect your CLI, install the GitHub App, and start seeing metrics
          in under five minutes.
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1 */}
        <SetupStep number="1" title="Sign in to the dashboard">
          <p>
            <Link href="/login" className="text-accent hover:underline">Sign in with GitHub</Link> to
            create your account. AX requests read-only access to your profile and email — no
            repository access is granted through OAuth.
          </p>
        </SetupStep>

        {/* Step 2 */}
        <SetupStep number="2" title="Copy your API key">
          <p>
            After signing in, you&apos;ll be guided through onboarding where your API key is displayed.
            Copy it — it&apos;s only shown once. You can rotate it later from{" "}
            <strong className="text-text-primary font-medium">Account Settings</strong>.
          </p>
        </SetupStep>

        {/* Step 3 */}
        <SetupStep number="3" title="Install and connect the CLI">
          <p>Install AX via Homebrew:</p>
          <CodeBlock>brew install acroos/tap/ax</CodeBlock>
          <p>Then connect it to your account:</p>
          <CodeBlock>ax init --api-key YOUR_API_KEY</CodeBlock>
          <p>
            This validates your key, writes a config file to <code className="bg-surface-2 rounded px-1.5 py-0.5 text-[12px] font-mono">~/.ax/config.json</code>,
            and installs a Claude Code <code className="bg-surface-2 rounded px-1.5 py-0.5 text-[12px] font-mono">SessionEnd</code> hook
            that automatically pushes session data when you finish working.
          </p>
        </SetupStep>

        {/* Step 4 */}
        <SetupStep number="4" title="Push your first data">
          <p>Push session data from any git repository:</p>
          <CodeBlock>ax push --repo .</CodeBlock>
          <p>
            Or push data for all discovered repos at once:
          </p>
          <CodeBlock>ax push --all</CodeBlock>
        </SetupStep>

        {/* Step 5 */}
        <SetupStep number="5" title="Install the GitHub App">
          <p>
            Navigate to <strong className="text-text-primary font-medium">Org Settings</strong> in
            the dashboard and click <strong className="text-text-primary font-medium">Install GitHub App</strong>.
            This grants AX access to webhook events (PRs opened, merged, closed) and triggers a
            90-day historical backfill of your existing PRs.
          </p>
          <p>
            This is a one-time step per GitHub organization. Only an org admin needs to do it.
          </p>
        </SetupStep>

        {/* Step 6 */}
        <SetupStep number="6" title="View your metrics">
          <p>
            Once data flows in, your dashboard populates automatically. Explore:
          </p>
          <ul className="list-disc list-inside space-y-1 text-text-secondary text-[14px] mt-2">
            <li><strong className="text-text-primary font-medium">Overview</strong> — Aggregate metrics at a glance</li>
            <li><strong className="text-text-primary font-medium">Pull Requests</strong> — Per-PR metric breakdown</li>
            <li><strong className="text-text-primary font-medium">Metric Drill-Down</strong> — Trends and distributions for each metric</li>
            <li><strong className="text-text-primary font-medium">Compare</strong> — Developer comparison across your team (Pro)</li>
          </ul>
        </SetupStep>

        {/* Inviting teammates */}
        <SetupStep number="7" title="Invite your team" optional>
          <p>
            From <strong className="text-text-primary font-medium">Org Settings</strong>, generate
            invite links for your team. Each link is single-use. Invited members sign in with GitHub
            and are automatically added to your organization.
          </p>
          <p>
            The free plan supports 1 member. <Link href="/plans" className="text-accent hover:underline">Upgrade to Pro</Link> for
            unlimited team members.
          </p>
        </SetupStep>
      </div>

      {/* Troubleshooting */}
      <div className="mt-16">
        <h2 className="text-[18px] font-semibold text-text-primary mb-4">
          Troubleshooting
        </h2>
        <div className="bg-surface-1 rounded-xl border border-border-subtle divide-y divide-border-subtle">
          <TroubleshootItem
            question="CLI says 401 Unauthorized"
            answer="Your API key may have been rotated. Generate a new one from Account Settings and run ax init again."
          />
          <TroubleshootItem
            question="PRs aren't showing up"
            answer="Make sure the GitHub App is installed on the correct org and the repo is connected. PRs must be in a terminal state (merged or closed) for metrics to compute."
          />
          <TroubleshootItem
            question="Session data not appearing after push"
            answer="Confirm your CLI is configured with ax init. Session data is matched to PRs by branch name — make sure you're working on a branch that has (or will have) an associated PR."
          />
          <TroubleshootItem
            question="GitHub App installation failed"
            answer="You need admin permissions on the GitHub organization. Ask an org admin to complete the installation from the Org Settings page."
          />
        </div>
      </div>
    </div>
  );
}

function SetupStep({
  number,
  title,
  children,
  optional,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="bg-surface-1 rounded-xl border border-border-subtle p-5">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-accent text-[12px] font-semibold">{number}</span>
        </div>
        <div className="flex-1 space-y-2.5">
          <h3 className="text-[15px] font-medium text-text-primary flex items-center gap-2">
            {title}
            {optional && (
              <span className="text-[11px] text-text-tertiary font-normal bg-surface-2 rounded px-1.5 py-0.5">
                Optional
              </span>
            )}
          </h3>
          <div className="text-[14px] text-text-secondary leading-relaxed space-y-2.5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 rounded-lg px-3.5 py-2.5">
      <code className="text-[13px] font-mono text-text-secondary">{children}</code>
    </div>
  );
}

function TroubleshootItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <div className="px-5 py-4">
      <h4 className="text-[14px] font-medium text-text-primary mb-1">{question}</h4>
      <p className="text-[13px] text-text-secondary leading-relaxed">{answer}</p>
    </div>
  );
}
