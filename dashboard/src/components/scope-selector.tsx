"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Globe, User, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ScopeTeam = {
  slug: string;
  name: string;
  parentName: string | null;
  memberCount: number;
};

type Props = {
  /** "everyone" | "me" | team slug */
  current: string;
  teams: ScopeTeam[];
  /** Build the target pathname for a given scope value */
  buildHref: (scope: string) => string;
};

const SCOPE_LABELS: Record<string, string> = {
  everyone: "Everyone",
  me: "Me",
};

function labelFor(scope: string, teams: ScopeTeam[]): string {
  if (SCOPE_LABELS[scope]) return SCOPE_LABELS[scope];
  const team = teams.find((t) => t.slug === scope);
  return team ? team.name : scope;
}

function iconFor(scope: string) {
  if (scope === "everyone") return <Globe className="size-3.5" />;
  if (scope === "me") return <User className="size-3.5" />;
  return <Users className="size-3.5" />;
}

export function ScopeSelector({ current, teams, buildHref }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const href = buildHref(value);
    // Preserve range param across scope changes
    const params = new URLSearchParams();
    const range = searchParams.get("range");
    if (range) params.set("range", range);
    const qs = params.toString();
    router.push(`${href}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change metric scope"
        className="inline-flex items-center gap-1.5 font-medium text-foreground transition-colors hover:text-primary"
      >
        {iconFor(current)}
        {labelFor(current, teams)}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuRadioGroup value={current} onValueChange={handleChange}>
          <DropdownMenuRadioItem value="everyone">
            <Globe className="mr-2 size-3.5 text-muted-foreground" />
            Everyone
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="me">
            <User className="mr-2 size-3.5 text-muted-foreground" />
            Me
          </DropdownMenuRadioItem>
          {teams.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {teams.map((t) => (
                <DropdownMenuRadioItem key={t.slug} value={t.slug}>
                  <Users className="mr-2 size-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {t.parentName ? `${t.parentName} > ${t.name}` : t.name}
                  </span>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {t.memberCount}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
