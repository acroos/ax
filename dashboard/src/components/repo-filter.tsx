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
  github_owner: string;
  github_repo: string;
};

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
        return r ? `${r.github_owner}/${r.github_repo}` : "All Repositories";
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
              {r.github_owner}/{r.github_repo}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
