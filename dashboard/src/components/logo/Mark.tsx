import * as React from "react";

type MarkProps = React.SVGProps<SVGSVGElement> & {
  /** Accessible title. Set to empty string to hide from AT. */
  title?: string;
};

/**
 * AX symbol. Ink strokes inherit from `currentColor` — set text color on
 * the parent to theme. The clay accent reads `--ax-clay` (falls back to
 * #B0602F). In dark mode, override with `--ax-clay: #D68250`.
 *
 * Sizing: width/height default to 1em so the mark scales with
 * surrounding text. Override via className (e.g. `h-6 w-6`) or style.
 */
export function Mark({ title = "AX", ...props }: MarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width="1em"
      height="1em"
      role="img"
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <g fill="none" stroke="currentColor" strokeWidth={3}>
        <line x1="20" y1="84" x2="100" y2="84" />
        <line x1="20" y1="79" x2="20" y2="89" />
        <line x1="100" y1="79" x2="100" y2="89" />
      </g>
      <circle cx="72" cy="52" r="7.5" fill="var(--ax-clay, #B0602F)" />
    </svg>
  );
}

export default Mark;
