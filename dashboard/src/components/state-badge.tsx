import { Badge } from "@/components/ui/badge";

/**
 * One of AX's non-judgmental status tones (THEME.md §3). Used for status
 * pills that need a soft tinted fill — PR state, role, installation
 * connected/suspended, "needs discussion" callouts.
 *
 * Kept as a small union so adding a new tone requires a shared-helper
 * update rather than scattering `/15 text-X border-X/25` strings across
 * call sites.
 */
export type Tone = "success" | "info" | "notice" | "attention" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success/25 text-success border-success/35",
  info: "bg-info/25 text-info border-info/35",
  notice: "bg-notice/25 text-notice border-notice/35",
  attention: "bg-attention/25 text-attention border-attention/35",
  muted: "bg-muted text-muted-foreground border-border",
};

export function toneClass(tone: Tone): string {
  return TONE_CLASSES[tone];
}

/**
 * Map GitHub PR state onto a tone. Merged → success (olive), open → info
 * (dusk), closed → attention (russet), anything else → muted. We avoid
 * literal red/green per ADR-006's non-judgmental ethos.
 */
function stateTone(state: string): Tone {
  switch (state) {
    case "merged":
      return "success";
    case "open":
      return "info";
    case "closed":
      return "attention";
    default:
      return "muted";
  }
}

export function StateBadge({ state }: { state: string | null }) {
  const s = (state ?? "unknown").toLowerCase();
  return (
    <Badge variant="outline" className={toneClass(stateTone(s))}>
      {s}
    </Badge>
  );
}
