import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ApiKeySection } from "./api-key-section";
import { LogoutButton } from "./logout-button";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Account</h1>
        <p className="text-sm text-text-secondary mt-1">
          Your personal settings and credentials
        </p>
      </div>

      {/* Profile */}
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Profile</h2>
        <p className="text-xs text-text-tertiary">
          Managed through your GitHub account.
        </p>

        <div className="flex items-center gap-4">
          {user.avatar_url && (
            <img
              src={user.avatar_url}
              alt=""
              className="w-12 h-12 rounded-full ring-1 ring-border-subtle"
            />
          )}
          <div className="space-y-0.5">
            {user.display_name && (
              <p className="text-sm font-medium text-text-primary">
                {user.display_name}
              </p>
            )}
            <p className="text-xs text-text-secondary">@{user.github_username}</p>
            {user.email && (
              <p className="text-xs text-text-tertiary">{user.email}</p>
            )}
          </div>
        </div>
      </div>

      {/* API Key */}
      <ApiKeySection />

      {/* Session */}
      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">Session</h2>
        <p className="text-xs text-text-tertiary">
          Log out of AX on this device. Your CLI configuration is not affected.
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}
