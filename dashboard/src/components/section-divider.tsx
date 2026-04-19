/**
 * Section divider — dot, title, and rule.
 *
 * Visual: ● Section Name ────────────────
 *
 * Only the dot carries clay (primary); rule and label use muted-foreground.
 */
export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-muted-foreground">
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="text-[11px] uppercase tracking-wider">
        {label}
      </span>
      <div className="h-px flex-1 bg-current" />
    </div>
  );
}
