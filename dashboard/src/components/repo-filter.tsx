"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type RepoOption = {
  id: number;
  platform: "github" | "gitlab";
  platform_owner: string;
  platform_repo: string;
};

function PlatformIcon({ platform }: { platform: "github" | "gitlab" }) {
  if (platform === "gitlab") {
    return (
      <svg viewBox="0 0 380 380" className="size-3.5 shrink-0" aria-hidden="true">
        <path d="m190.08 349.44 69.87-215.14H120.2z" fill="#E24329" />
        <path d="m190.08 349.44-69.87-215.14H30.22z" fill="#FC6D26" />
        <path d="M30.22 134.3 4.33 213.84a17.66 17.66 0 0 0 6.42 19.75l179.33 130.27z" fill="#FCA326" />
        <path d="M30.22 134.3h89.99L83.15 11.73a8.88 8.88 0 0 0-16.89 0z" fill="#E24329" />
        <path d="m190.08 349.44 69.87-215.14h89.99z" fill="#FC6D26" />
        <path d="M349.94 134.3 375.83 213.84a17.66 17.66 0 0 1-6.42 19.75L190.08 363.86z" fill="#FCA326" />
        <path d="M349.94 134.3h-89.99l37.06-122.57a8.88 8.88 0 0 1 16.89 0z" fill="#E24329" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5 shrink-0" aria-hidden="true">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

export function RepoFilter({
  repos,
  current,
}: {
  repos: RepoOption[];
  current?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentLabel = current
    ? (() => {
        const r = repos.find((r) => r.id === current);
        return r ? `${r.platform_owner}/${r.platform_repo}` : "All Repositories";
      })()
    : "All Repositories";

  if (repos.length === 0) {
    return <span className="font-medium text-foreground">{currentLabel}</span>;
  }

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("repo");
    } else {
      params.set("repo", value);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Filter by repository"
        className="inline-flex items-center gap-1 align-middle font-medium text-foreground transition-colors hover:text-primary"
      >
        {currentLabel}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={current ? String(current) : "all"}
          onValueChange={handleChange}
        >
          <DropdownMenuRadioItem value="all">
            All Repositories
          </DropdownMenuRadioItem>
          {repos.map((r) => (
            <DropdownMenuRadioItem key={r.id} value={String(r.id)}>
              <span className="inline-flex items-center gap-1.5">
                <PlatformIcon platform={r.platform} />
                {r.platform_owner}/{r.platform_repo}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
