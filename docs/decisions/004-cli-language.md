# ADR-004: Go for CLI

## Status
Accepted

## Date
2026-03-24

## Context
We need to choose a language for the CLI. The primary developer is most comfortable with TypeScript, but the tool needs single-binary distribution with no runtime dependencies for end users.

## Decision
Go for the CLI from the start. TypeScript/Next.js for the dashboard only.

Key reasons:
- Single static binary, no runtime dependency
- Distributable via Homebrew without requiring Node.js
- Strong CLI ecosystem (cobra, viper, etc.)
- Cross-compilation is trivial

## Alternatives Considered
- **TypeScript everywhere** — requires Node.js runtime on user machines, npm package naming conflicts (`ax` is taken), heavier install
- **Rust** — steeper learning curve for contributors, slower compile times, overkill for a CLI of this scope

## Consequences
- End users get a single binary with zero dependencies
- Homebrew and GitHub Releases distribution is straightforward
- The developer needs to work in Go (less familiar) for the CLI, but Go's simplicity reduces the ramp-up cost
- Two languages in the repo (Go + TypeScript) means contributors may only be comfortable with one half
