// Marketing and public route segments. Shared between the proxy (public path
// gating) and the app layout (org slug parsing) so they stay in sync when new
// routes are added.
export const MARKETING_SEGMENTS = [
  "docs",
  "plans",
  "setup",
  "changelog",
  "terms",
] as const;
