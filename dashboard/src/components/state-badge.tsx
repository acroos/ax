import { Badge } from "@/components/ui/badge";

/**
 * Mapping from GitHub PR state to a status token. Per THEME.md §3, we avoid
 * literal red/green — merged is `success` (olive), open is `info` (dusk),
 * closed is `attention` (russet). Unknown falls back to the neutral
 * `secondary` chip.
 */
type State = "merged" | "open" | "closed" | "draft" | string;

export function StateBadge({ state }: { state: State | null }) {
  const s = (state ?? "unknown").toLowerCase();
  const classes: Record<string, string> = {
    merged: "bg-success/15 text-success border-success/20",
    open: "bg-info/15 text-info border-info/25",
    closed: "bg-attention/15 text-attention border-attention/25",
    draft: "bg-muted text-muted-foreground border-border",
  };
  const variantClass =
    classes[s] ?? "bg-muted text-muted-foreground border-border";

  return (
    <Badge variant="outline" className={variantClass}>
      {s}
    </Badge>
  );
}
