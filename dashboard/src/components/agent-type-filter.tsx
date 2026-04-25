"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { AgentType } from "@/lib/db";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LABELS: Record<AgentType | "all", string> = {
  all: "All Agents",
  claude_code: "Claude Code",
  copilot_cli: "Copilot CLI",
};

export function AgentTypeFilter({ current }: { current?: AgentType }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = current ?? "all";

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("agent_type");
    } else {
      params.set("agent_type", next);
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Filter by agent type"
        className="inline-flex items-center gap-1 align-middle font-medium text-foreground transition-colors hover:text-primary"
      >
        {LABELS[value]}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={handleChange}>
          <DropdownMenuRadioItem value="all">All Agents</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="claude_code">Claude Code</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="copilot_cli">Copilot CLI</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
