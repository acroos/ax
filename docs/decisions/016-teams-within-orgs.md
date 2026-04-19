# ADR-016: Teams within Organizations

## Status
Accepted

## Date
2026-04-18

## Context
As organizations grow, there's no way to view metrics scoped to a subset of people. Engineering managers and team leads need to see how their specific team is performing with agentic coding, not just the org-wide aggregate.

## Decision

Introduce **teams** as groups of people within organizations:

- **Data model:** `teams` table (org-scoped slug, self-referential `parent_team_id` for nesting) and `team_memberships` table (references `org_membership_id`, not `user_id`, so membership auto-cleans on org removal).
- **Metric scoping:** Team metrics = PRs where `prs.author` matches team members' `github_username` (recursive through child teams). MetricsAggregator is scope-agnostic — no changes needed.
- **Access control boundary:** Regular members can only visit team routes for teams they belong to. Admins/owners see all. Org-wide views (`/{slug}`) remain unrestricted.
- **Navigation:** Teams get their own routes (`/{slug}/teams/{team-slug}`), not a query-param filter. Sidebar shows a "Teams" group for Pro-plan orgs.
- **Management:** Admin/owner only. Create/edit/delete teams in org settings. Deleting a team cascade-deletes all descendant teams.
- **Pro-only:** Teams capability gated behind the Pro plan. Free plan (single-member) has no need for teams.

## Alternatives Considered

- **Teams as a filter (query param):** Simpler but doesn't allow access control. Harder to share "this team's dashboard" as a URL.
- **Teams scoping repos (not people):** Doesn't align with the product ethos of measuring teams. A repo can be worked on by multiple teams.
- **Teams referencing `user_id` directly:** Riskier — if someone leaves the org, orphaned team memberships remain. Using `org_membership_id` with `dependent: :destroy` handles cleanup automatically.

## Consequences

- **Easier:** Viewing metrics for a specific team, comparing team performance over time, onboarding new team leads with a scoped view.
- **Harder:** Must keep team membership in sync with actual team composition. No automated sync with GitHub teams (manual assignment for now).
- **Future:** Could add GitHub team sync, team-level insights/recommendations, or restrict org-wide views per team (org-level setting).
