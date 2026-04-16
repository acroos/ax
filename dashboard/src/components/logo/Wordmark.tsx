import * as React from "react";

type WordmarkProps = React.SVGProps<SVGSVGElement> & {
  title?: string;
};

/**
 * AX wordmark. Ink inherits from `currentColor`. Clay accent reads
 * `--ax-clay` (fallback #B0602F). The serif stack is inlined so the
 * wordmark remains on-brand even when the consuming app doesn't have
 * the serif set globally.
 *
 * Recommended sizing: set height and let width follow the 360:170
 * aspect ratio (roughly 2.12:1). Example: `h-7 w-auto`.
 */
export function Wordmark({ title = "AX", ...props }: WordmarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 360 170"
      role="img"
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <text
        x={180}
        y={106}
        fontFamily="'Iowan Old Style', 'Charter', 'Source Serif 4', Georgia, serif"
        fontSize={120}
        fontWeight={600}
        letterSpacing="-0.02em"
        textAnchor="middle"
        fill="currentColor"
      >
        AX
      </text>
      <g fill="none" stroke="currentColor" strokeWidth={1.6}>
        <line x1="76" y1="128" x2="284" y2="128" />
        <line x1="76" y1="124" x2="76" y2="132" />
        <line x1="284" y1="124" x2="284" y2="132" />
      </g>
      <circle cx="216" cy="118" r="4.2" fill="var(--ax-clay, #B0602F)" />
    </svg>
  );
}

export default Wordmark;
