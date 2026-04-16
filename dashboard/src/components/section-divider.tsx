/**
 * Section divider using the AX axis-rule-and-dot motif.
 *
 * Visual: │── ● Section Name ────────────────│
 *
 * Rule and ticks use muted-foreground; only the dot carries clay (primary).
 */
export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-muted-foreground">
      <div className="h-2.5 w-px bg-current" />
      <div className="h-px w-2 bg-current" />
      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span className="font-serif text-[11px] uppercase tracking-wider">
        {label}
      </span>
      <div className="h-px flex-1 bg-current" />
      <div className="h-2.5 w-px bg-current" />
    </div>
  );
}
