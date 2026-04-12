# Conventions

Patterns and norms for working in the AX codebase.

## Go CLI

### File Organization
- One metric area per file in `internal/metrics/` (e.g., `output_quality.go`, `planning.go`), each with a corresponding `_test.go`
- Session parser in `internal/parsers/claude_sessions.go`
- GitHub/git data types in `internal/parsers/github.go` (types only, no CLI interaction)
- Token pricing in `internal/pricing/` with model-specific lookup tables

### Testing
- Metric tests use inline data — no fixtures or factories
- Session parser tests use temp files created in tests

### External Dependencies
- Session parser reads JSONL files directly (no external CLIs)
- Token pricing lives in `internal/pricing/` with model-specific lookup tables
- CLI shells out to `git` only to resolve remote URLs (for repo identification)

## Rails Server

### File Organization
- Models in `server/app/models/`, one per file
- Controllers namespaced under `Api::V1::` in `server/app/controllers/api/v1/`
- Services in `server/app/services/` — business logic stays out of controllers
- Webhook handlers in `server/app/services/webhook_handlers/`, one per event type, inheriting from `Base`

### Database
- Schema managed via Rails migrations in `server/db/migrate/`
- Use `find_or_create_by` / `create_or_find_by` patterns for upserts
- `PrMetrics` has a finalization lock — `before_update` callback prevents changes once finalized

### Testing
- RSpec + FactoryBot in `server/spec/`
- Run with `bundle exec rspec`

### Auth Patterns
- `require_api_key_auth!` for CLI endpoints (push, watch-status)
- `require_session_auth!` for dashboard endpoints
- `find_org!` / `find_org_as_admin!` for org-scoped authorization

## Dashboard

### File Organization
- Pages follow Next.js App Router: `src/app/<route>/page.tsx`
- Org-scoped pages under `src/app/[slug]/`
- Shared components in `src/components/`
- Data layer in `src/lib/db.ts`, auth in `src/lib/auth.ts`

### Styling
- Tailwind CSS v4, dark mode only
- Custom theme tokens in `src/app/globals.css`
- No CSS modules or styled-components

## Cross-Cutting

### Documentation
- Every metric has a dedicated doc in `docs/metrics/` explaining what, why, how, and interpretation
- Architecture decisions in `docs/decisions/` following the [ADR template](../docs/decisions/TEMPLATE.md)
- Feature plans in `plans/`

### Build Commands
```bash
make build        # Go CLI → bin/ax
make test         # Go tests
make fmt          # Go format
make lint         # Go lint (golangci-lint)

cd server
bundle exec rspec # Rails tests

cd dashboard
npm run dev       # Dashboard dev server (:3333)
```
