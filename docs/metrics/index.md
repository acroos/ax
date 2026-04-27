# AX Metrics Reference 📊

AX tracks 15 metrics across three categories — 9 are displayed on the overview dashboard, and 6 legacy metrics remain available on detail pages. Each metric has its own detailed doc — click through for the full story.

## Metric Categories

**🚀 Delivery** — How quickly and consistently is the team shipping work?

**🎯 Session Effectiveness** — How efficiently are sessions translating prompts into completed work?

**📈 Adoption Maturity** — How deeply has the team adopted agentic coding practices and tooling?

---

## Displayed Metrics

These 9 metrics appear on the overview dashboard.

| # | Metric | Category | Brief Description | Data Sources |
|---|--------|----------|-------------------|--------------|
| 1 | [Task Cycle Time](./task-cycle-time.md) | Delivery | Hours from first session to PR merge/close | Sessions, GitHub API |
| 2 | [PR Throughput](./pr-throughput.md) | Delivery | Merged PRs per contributor per week | GitHub API |
| 3 | [Post-Open Commits](./post-open-commits.md) | Delivery | Commits landing after a PR was opened | Git, GitHub API |
| 4 | [Iteration Depth](./iteration-depth.md) | Session Effectiveness | Back-and-forth turn pairs per session | Session data |
| 5 | [Peak Context Window %](./peak-context-window.md) | Session Effectiveness | Highest context utilization in a session | Session data |
| 6 | [Autonomy Score](./autonomy-score.md) | Session Effectiveness | Ratio of assistant to human messages | Session data |
| 7 | [Skill & Tool Usage](./skill-tool-usage.md) | Adoption Maturity | Fraction of tool calls using custom skills/MCP | Session data |
| 8 | [Subagent Delegation](./subagent-delegation.md) | Adoption Maturity | Fraction of tool calls spawning subagents | Session data |
| 9 | [Rubber Stamp Rate](./rubber-stamp-rate.md) | Adoption Maturity | Rate of large PRs merged without meaningful review | GitHub API |

## Legacy Metrics

These metrics are still computed and accessible on detail pages but are no longer shown on the overview dashboard.

| # | Metric | Category | Brief Description | Data Sources |
|---|--------|----------|-------------------|--------------|
| 10 | [CI Success Rate](./ci-success-rate.md) | Delivery | Percentage of commits/PRs passing CI on first push | GitHub Status Checks |
| 11 | [Line Revisit Rate](./line-revisit-rate.md) | Delivery | How often the same lines are modified across different PRs | Git blame/diff |
| 12 | [Token Total per PR](./token-cost-per-pr.md) | Session Effectiveness | Input plus output tokens consumed across sessions for a PR | Session data |
| 13 | [Cache Hit Rate](./cache-hit-rate.md) | Session Effectiveness | Ratio of cache-read tokens to total input tokens | Session data |
| 14 | [Sidechain Rate](./sidechain-rate.md) | Session Effectiveness | Fraction of Claude Code messages on sidechain branches (backtracking) | Claude Code session data |
| 15 | [Re-Read Rate](./re-read-rate.md) | Session Effectiveness | Total file reads divided by unique files read | Session data |

---

## Deferred Metrics

These were considered but deferred. They may return in future iterations:

- **Time-to-Merge** — Conflates human review latency with agent quality; unreliable without normalization.
- **~~Token Usage per PR~~** — Reintroduced as [Token Total per PR](./token-cost-per-pr.md) using the cross-agent `input_tokens + output_tokens` unit.
- **Human Edit Rate** — Hard to distinguish style preference edits from correctness fixes without manual classification.
- **PR Size Distribution** — Useful as a normalizing dimension but not independently actionable. May be added as a supporting dimension.

## Removed Metrics

The following metrics were previously tracked and have been removed because they did not produce reliable signal:

- Review Cycle Time
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
