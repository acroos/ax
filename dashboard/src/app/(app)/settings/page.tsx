export const runtime = "edge";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { ApiKeySection } from "./api-key-section";
import { DeleteAccountSection } from "./delete-account-section";
import { LogoutButton } from "./logout-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your personal settings and credentials
        </p>
      </div>

      {/* Profile */}
      <Card className="p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-sm font-medium text-foreground">Profile</h2>
          <p className="text-xs text-muted-foreground">
            Managed through your GitHub account.
          </p>

          <div className="flex items-center gap-4">
            <Avatar className="size-12">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt="" />}
              <AvatarFallback>
                {(user.display_name || user.github_username)
                  .charAt(0)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-0.5">
              {user.display_name && (
                <p className="text-sm font-medium text-foreground">
                  {user.display_name}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                @{user.github_username}
              </p>
              {user.email && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Key */}
      <ApiKeySection />

      {/* Session */}
      <Card className="p-6">
        <CardContent className="space-y-4 p-0">
          <h2 className="text-sm font-medium text-foreground">Session</h2>
          <p className="text-xs text-muted-foreground">
            Log out of AX on this device. Your CLI configuration is not
            affected.
          </p>
          <LogoutButton />
        </CardContent>
      </Card>

      {/* Delete Account */}
      <DeleteAccountSection />
    </div>
  );
}
