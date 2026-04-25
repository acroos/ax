# Conventions

Patterns and norms for working in the AX codebase.

## Go CLI

### File Organization
- All Go code lives under `cli/`
- One metric area per file in `cli/internal/metrics/` (e.g., `output_quality.go`, `planning.go`), each with a corresponding `_test.go`
- Session parsers in `cli/internal/parsers/claude_sessions.go` and `cli/internal/parsers/copilot_sessions.go`
- GitHub/git data types in `cli/internal/parsers/github.go` (types only, no CLI interaction)
- Context-window lookup in `cli/internal/pricing/` with model-specific lookup tables

### Testing
- Metric tests use inline data — no fixtures or factories
- Session parser tests use temp files created in tests

### External Dependencies
- Session parser reads JSONL files directly (no external CLIs)
- Context-window lookup lives in `cli/internal/pricing/` with model-specific lookup tables
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

### Plan / Capability Enforcement
- All plan checks go through `PlanService.for(org)` — never check `org.plan` directly
- `capability(key)` returns the effective value (boolean or numeric)
- `can?(key)` for feature gates, `within_limit?(key, count)` for numeric limits
- Plan definitions in `config/initializers/plans.rb` (frozen `PLANS` constant)
- Per-org overrides via `organizations.plan_overrides` (jsonb) — overrides merge on top of plan defaults
- In controllers: `enforce_limit!(:key, count)` returns 403 with `upgrade_required: true`
- `history_cutoff` returns a Time (or nil for unlimited) — use to restrict access to old data based on `history_days`
- In services: check `PlanService.for(org).within_limit?` and raise domain error
- Rake tasks: `ax:set_plan[slug,plan]`, `ax:override[slug,key,value]` for manual management

### Seat-Based Pricing (Pro)
- Pro is per-seat: `subscription.quantity` is the number of purchased seats and the source of truth for `max_members`
- When adding members on Pro, call `SeatService.add_seat!(org)` BEFORE creating the membership — Stripe failure rolls back the membership
- When removing members on Pro, call `SeatService.remove_seat!(org)` AFTER deleting the membership — Stripe failure does not block the removal (webhook reconciles)
- Invite creation skips the `max_members` limit check on Pro since seats auto-purchase on acceptance
- Both SeatService methods no-op for orgs without an active/trialing subscription, so callers can invoke unconditionally

## Dashboard

### File Organization
- Pages follow Next.js App Router: `src/app/<route>/page.tsx`
- Org-scoped pages under `src/app/[slug]/`
- Shared components in `src/components/`
- Data layer in `src/lib/db.ts`, auth in `src/lib/auth.ts`

### Styling
- Tailwind CSS v4 with the Parchment & Clay theme (`dashboard/src/app/globals.css`). See [`dashboard/THEME.md`](../dashboard/THEME.md) for the canonical token usage guide.
- Light mode is the default; dark mode is user-toggleable via `next-themes`. Never write `dark:` Tailwind variants for colors that have semantic tokens — the tokens remap automatically.
- Primitive UI (button, dialog, dropdown, input, select, tabs, tooltip, etc.) comes from [shadcn/ui](https://ui.shadcn.com/) under `src/components/ui/`. Install new primitives with `npx shadcn@latest add <name>` from `dashboard/`.
- Application components under `src/components/` compose shadcn primitives. Don't hand-roll buttons, dropdowns, dialogs, or other primitives.
- No CSS modules or styled-components.

## Cross-Cutting

### Documentation
- Every metric has a dedicated doc in `docs/metrics/` explaining what, why, how, and interpretation
- Architecture decisions in `docs/decisions/` following the [ADR template](../docs/decisions/TEMPLATE.md)
- Feature plans in `plans/`

### Build Commands

This project uses [Just](https://github.com/casey/just) as a command runner. A root `Justfile` delegates to each sub-project.

```bash
# From root
just              # List all recipes
just test         # Run all tests (CLI + server)
just lint         # Lint all projects
just cli-build    # Go CLI → cli/bin/ax
just cli-test     # Go tests
just server-test  # Rails tests
just dashboard-dev # Dashboard dev server (:3333)
```
