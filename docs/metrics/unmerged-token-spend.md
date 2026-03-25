# Unmerged Token Spend

## What It Measures

The total dollar cost of tokens from Claude Code sessions that either (a) correlate to pull requests that were closed without merging, or (b) don't correlate to any pull request at all. This is a repo-level aggregate metric, not a per-PR metric. It is expressed as both an absolute dollar amount and as a rate — the ratio of unmerged cost to total cost across all sessions.

## Why It Matters

Not all agent-assisted work ships. Some PRs are abandoned, some sessions are exploratory dead ends, and some work is started but never finished. Unmerged Token Spend surfaces how much of a team's total spend goes to work that never reaches production. While some waste is inevitable and even healthy (exploration, spikes, abandoned approaches that inform better solutions), consistently high waste suggests process issues — unclear requirements, poor planning, or developers starting work that gets deprioritized.

Tracking this metric at the repo level gives engineering leaders visibility into the overall efficiency of their team's agent usage, separate from the quality of any individual PR.

## How It's Calculated

1. Compute the dollar cost of each Claude Code session using per-message cost computation (same method as Token Cost per PR).
2. Classify each session:
   - **Merged:** Correlates to a PR that was merged.
   - **Unmerged:** Correlates to a PR that was closed without merging.
   - **Uncorrelated:** Does not correlate to any PR.
   - **Open:** Correlates to a PR that is still open — these are **excluded** from the calculation entirely.
3. Aggregate costs.

```
merged_cost = sum(session.cost for session in sessions if session.pr_status == "merged")
unmerged_cost = sum(session.cost for session in sessions if session.pr_status == "closed")
uncorrelated_cost = sum(session.cost for session in sessions if session.pr is None)

waste_cost = unmerged_cost + uncorrelated_cost
total_cost = merged_cost + waste_cost  # excludes open PR sessions

unmerged_rate = waste_cost / total_cost if total_cost > 0 else 0
```

Open PRs are excluded because they represent in-progress work — their final outcome is unknown.

## Interpreting Values

- **Good:** Under 15% unmerged rate. Some exploration spend is healthy — it means the team is experimenting, spiking on approaches, and making informed decisions about what to build. A 0% rate would actually be concerning, suggesting the team never explores or abandons dead-end approaches.
- **Concerning:** Over 30% unmerged rate sustained over weeks. Large absolute dollar amounts on abandoned work. An increasing trend in unmerged rate suggests worsening requirements clarity or planning quality. Also concerning: a small number of sessions accounting for a disproportionate share of waste cost.
- **Ambiguity:** Sessions not correlated to any PR might be legitimate non-PR work — refactoring that gets squashed into another branch, documentation generation, exploration to answer a technical question, or local tooling setup. Open PRs are excluded from the calculation to avoid penalizing in-progress work. This metric works best when evaluated over multi-week windows to smooth out natural variation.

## Data Sources Required

- **Claude Code session data** — Per-message usage fields (input tokens, output tokens, cache tokens, model) for computing dollar cost per session.
- **PR merge status** — Whether each PR was merged, closed without merging, or is still open. Sourced from the GitHub API.

## Phase

**Phase 2** — Requires Claude Code session data ingestion.
