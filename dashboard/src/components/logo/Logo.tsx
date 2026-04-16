import * as React from "react";
import { Mark } from "./Mark";
import { Wordmark } from "./Wordmark";

type LogoProps = {
  variant?: "mark" | "wordmark";
  className?: string;
  title?: string;
};

/**
 * Convenience wrapper. Use `variant="mark"` for favicons, tight spots,
 * and avatar-like placements. Use `variant="wordmark"` (default) for
 * headers, marketing, and anywhere the full name is warranted.
 *
 * Example:
 *   <Logo variant="wordmark" className="h-7 w-auto text-foreground" />
 *   <Logo variant="mark"     className="h-8 w-8 text-foreground" />
 */
export function Logo({ variant = "wordmark", className, title = "AX" }: LogoProps) {
  return variant === "mark"
    ? <Mark className={className} title={title} />
    : <Wordmark className={className} title={title} />;
}

export default Logo;
