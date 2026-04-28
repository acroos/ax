"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ALL_AGENTS, AGENT_LABELS, type AgentType } from "@/lib/agents.gen";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AgentTypeFilter({
  current,
  agents = ALL_AGENTS,
}: {
  current?: AgentType;
  agents?: readonly AgentType[];
}) {
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
        {current ? AGENT_LABELS[current] : "All Agents"}
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={handleChange}>
          <DropdownMenuRadioItem value="all">All Agents</DropdownMenuRadioItem>
          {agents.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              {AGENT_LABELS[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
