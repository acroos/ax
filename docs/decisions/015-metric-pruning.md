# ADR-015: Metric Pruning

## Status
Accepted

## Date
2026-04-16

## Context
Since ADR-001 and the additions in ADR-009 and post-ADR-001 session-derived metrics, the dashboard had grown to 20 PR-level metrics plus the repo-level Unmerged Token Spend. Several of these metrics were not producing useful signal:

- **First-Pass Acceptance** — Review semantics vary too much across teams (some squash-merge without review, some auto-approve bots). The boolean rarely changed people's behavior.
- **Test Coverage (`has_tests`)** — Filename-based detection was noisy. A PR with no test file edits can still be fully tested, and a PR with test file edits can still be gaming coverage.
- **Diff Churn** — The `total_commit_additions - net_additions` heuristic correlates more with "did the author rebase or squash?" than with actual rework.
- **Messages per PR** — Heavily duplicated with Iteration Depth but less meaningful (one long message ≠ inefficient).
- **Self-Correction Rate**, **Context Efficiency**, **Error Recovery Attempts** — All three leaned on bash success/error counts and file read/write counts that were too coarse to interpret. They appeared precise but were not.
- **Plan Coverage**, **Plan Deviation**, **Scope Creep** — The plan-extraction heuristic (regex on backtick-wrapped paths in `/plans/` files) generated too many false matches and missed too many implicit planned files. The three derived metrics inherited this noise.

## Decision

Remove the following ten metrics from the product:
- First-Pass Acceptance Rate
- Test Coverage of Generated Code
- Diff Churn
- Messages per PR
- Self-Correction Rate
- Context Efficiency
- Error Recovery Efficiency
- Plan-to-Implementation Coverage
- Plan Deviation Score
- Scope Creep Detection

Along with the dashboard "Total Token Cost" summary card (which was a display aggregate, not a stored metric).

Removal covers: DB columns on `pr_metrics` and `sessions`, the `plan_analyses` table, CLI parsing and serialization, Rails services and controllers, dashboard types and pages, per-metric docs, and all references to metric counts or category names in marketing, wiki, and ADRs.

## Kept

The product now tracks **9 PR-level metrics** across **three categories**:

**Output Quality:** Post-Open Commits, CI Success Rate, Line Revisit Rate

**Prompt Efficiency:** Iteration Depth, Token Cost per PR, Cache Hit Rate

**Agent Behavior:** Sidechain Rate, Re-Read Rate, Autonomy Score

## Consequences
- Supersedes the "Planning Effectiveness" category from ADR-001 entirely. The plan extraction pipeline (`ExtractPlannedFiles`, `PlanAnalysis` model, `compute_plan_metrics`) is removed.
- Supersedes the specific ADR-001 metrics listed above. ADR-001's framing (four dimensions) is now three dimensions.
- CLI `SessionData` payload no longer includes `bash_errors`, `bash_successes`, or `planned_files`. Old CLIs pushing those fields will have them ignored by the strong-params filter.
- Historical `pr_metrics` data for removed columns is dropped — the migration is irreversible.
- Review Cycle Time was subsequently removed (not agent-quality signal — it measures team review latency, not agent output).
- Marketing copy and wiki counts updated to reflect 9 metrics / 3 categories.
