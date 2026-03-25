# ADR-008: Homebrew + GitHub Releases

## Status
Accepted

## Date
2026-03-24

## Context
We need to distribute the `ax` binary to end users. The distribution method should be familiar, low-friction, and support automatic updates.

## Decision
Three distribution channels:

1. **Homebrew tap** (primary) — `brew install austinroos/tap/ax` for macOS and Linux users
2. **GitHub Releases** — pre-built binaries for all platforms via GoReleaser, for users who prefer direct downloads
3. **`go install`** — for Go developers who want to build from source

Additionally, the dashboard is deployed to Vercel for the managed/hosted version, separate from the CLI distribution.

## Alternatives Considered
- **npm publish** — requires Node.js runtime, naming conflicts (`ax` likely taken on npm)
- **Snap / Flatpak** — Linux-only, adds complexity without broad enough reach
- **Docker image only** — too heavy for a CLI tool, poor ergonomics for daily use

## Consequences
- Homebrew gives us auto-updates and a familiar install experience on macOS
- GoReleaser automates cross-platform binary builds and GitHub Release creation
- Three channels to maintain, but GoReleaser handles most of the work
- Vercel deployment for the hosted dashboard is independent of CLI releases
