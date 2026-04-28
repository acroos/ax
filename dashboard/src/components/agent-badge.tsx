import { AGENT_LABELS, AGENT_COLORS, type AgentType } from "@/lib/agents.gen";

export function AgentBadge({ id }: { id: AgentType }) {
  const label = AGENT_LABELS[id];
  const color = AGENT_COLORS[id];

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
