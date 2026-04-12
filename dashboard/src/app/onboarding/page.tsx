import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // In managed mode, fetch the API key from the server
  const apiUrl = process.env.AX_API_URL || "http://localhost:3000";

  return (
    <div className="min-h-screen flex items-center justify-center bg-void">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl tracking-tight">ax</span>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Welcome, {user.display_name || user.github_username}
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Set up your CLI to start tracking metrics
          </p>
        </div>

        <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
          <h2 className="text-sm font-medium text-text-primary">1. Install AX</h2>
          <pre className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary font-mono overflow-x-auto">
            brew install acroos/tap/ax
          </pre>

          <h2 className="text-sm font-medium text-text-primary mt-6">2. Connect to your team</h2>
          <p className="text-xs text-text-tertiary">
            Your API key was generated when you signed up. Find it in{" "}
            <a href="/settings" className="text-accent hover:underline">Settings</a>.
          </p>
          <pre className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary font-mono overflow-x-auto">
            {`ax init --team ${apiUrl} --api-key <your-key> --user "${user.display_name || user.github_username}"`}
          </pre>

          <h2 className="text-sm font-medium text-text-primary mt-6">3. Push your data</h2>
          <pre className="bg-surface-0 rounded-lg p-3 text-xs text-text-secondary font-mono overflow-x-auto">
            cd your-repo && ax push
          </pre>
        </div>

        <div className="text-center">
          <a
            href={`/${user.organizations[0]?.slug || ""}`}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
