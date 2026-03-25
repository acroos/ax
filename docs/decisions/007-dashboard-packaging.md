# ADR-007: Embedded Static Dashboard in Go Binary

## Status
Accepted

## Date
2026-03-24

## Context
We need to decide how `ax dashboard` works for end users. The dashboard is built with Next.js, but requiring Node.js on user machines contradicts our single-binary distribution goal (ADR-004).

## Decision
Pre-build the Next.js dashboard as a static export and embed it in the Go binary via `go:embed`. When a user runs `ax dashboard`, the binary serves the static files on a local port.

- **End users:** `ax dashboard` just works, no Node.js required
- **Contributors:** run `npm run dev` in the `dashboard/` directory for hot-reload development

The static export is built as part of the release pipeline before the Go binary is compiled.

## Alternatives Considered
- **Require Node.js for dashboard** — poor end-user experience, contradicts the single-binary goal
- **Separate install for dashboard** — fragmented experience, two things to install and keep in sync

## Consequences
- End users get the dashboard with zero additional dependencies
- Binary size increases (static assets are embedded), but this is acceptable for the improved UX
- Dashboard features are limited to what static export supports (no SSR, no API routes within Next.js — the Go binary serves API endpoints instead)
- Release pipeline must build the dashboard before compiling the Go binary
