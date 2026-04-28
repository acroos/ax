import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isAgentType, type AgentType } from "@/lib/agents.gen";

/**
 * Compose Tailwind class names safely. clsx handles conditional/nested
 * class inputs; tailwind-merge resolves conflicts so later classes win
 * (e.g. `cn("px-2", "px-4")` → `"px-4"`). Use everywhere class names
 * are composed dynamically, especially when building on shadcn/ui
 * primitives.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function parseAgentType(value?: string): AgentType | undefined {
  return value && isAgentType(value) ? value : undefined;
}
