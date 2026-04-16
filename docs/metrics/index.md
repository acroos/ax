# AX Metrics Reference 📊

AX tracks 10 metrics across three categories to give you the picture of how your agentic coding workflow is performing. Each metric has its own detailed doc — click through for the full story.

## Metric Categories

**🏗️ Output Quality** — Is the agent producing clean, mergeable work on the first try?

**💬 Prompt Efficiency** — How efficiently are prompts translating into completed work?

**🤖 Agent Behavior** — How well does the agent operate autonomously — reading, writing, staying on task?

---

## All Metrics

| # | Metric | Category | Brief Description | Data Sources | Phase |
|---|--------|----------|-------------------|--------------|-------|
| 1 | [Post-Open Commits](./post-open-commits.md) | Output Quality | Commits landing after a PR was opened | Git, GitHub API | 1 |
| 2 | [CI Success Rate](./ci-success-rate.md) | Output Quality | Percentage of commits/PRs passing CI on first push | GitHub Status Checks | 1 |
| 3 | [Line Revisit Rate](./line-revisit-rate.md) | Output Quality | How often the same lines are modified across different PRs | Git blame/diff | 1 |
| 4 | [Review Cycle Time](./review-cycle-time.md) | Output Quality | Time from PR open to first human review comment | GitHub Events, Webhooks | 1 |
| 5 | [Iteration Depth](./iteration-depth.md) | Prompt Efficiency | Count of back-and-forth turn pairs (user to agent) per task | Session data | 2 |
| 6 | [Token Cost per PR](./token-cost-per-pr.md) | Prompt Efficiency | Dollar cost of tokens consumed across sessions correlated to a PR | Session data, Pricing module | 2 |
| 7 | [Cache Hit Rate](./cache-hit-rate.md) | Prompt Efficiency | Ratio of cache-read tokens to total input tokens | Session data | 2 |
| 8 | [Unmerged Token Spend](./unmerged-token-spend.md) | Prompt Efficiency | Total dollar cost of tokens on unmerged or uncorrelated work (repo-level) | Session data, PR merge status | 2 |
| 9 | [Sidechain Rate](./sidechain-rate.md) | Agent Behavior | Fraction of messages on sidechain branches (backtracking) | Session data | 2 |
| 10 | [Re-Read Rate](./re-read-rate.md) | Agent Behavior | Total file reads divided by unique files read | Session data | 2 |
| 11 | [Autonomy Score](./autonomy-score.md) | Agent Behavior | Ratio of assistant to human messages | Session data | 2 |

---

## Build Phases

### Phase 1 — Git and GitHub Data 🟢

Metrics calculated from git history, the GitHub API, and GitHub webhook events. No session data needed — these work the moment you install the GitHub App.

**Metrics:** Post-Open Commits, CI Success Rate, Line Revisit Rate, Review Cycle Time

### Phase 2 — Session Data 🟢

Metrics that use Claude Code session logs (messages, tool calls, token usage). These light up once you connect the CLI with `ax init`.

**Metrics:** Iteration Depth, Token Cost per PR, Cache Hit Rate, Unmerged Token Spend, Sidechain Rate, Re-Read Rate, Autonomy Score

---

## Deferred Metrics

These were considered but deferred. They may return in future iterations:

- **Time-to-Merge** — Conflates human review latency with agent quality; unreliable without normalization.
- **~~Token Usage per PR~~** — Raw token counts are noisy. Evolved into [Token Cost per PR](./token-cost-per-pr.md), which uses dollar cost with model-specific pricing.
- **Human Edit Rate** — Hard to distinguish style preference edits from correctness fixes without manual classification.
- **PR Size Distribution** — Useful as a normalizing dimension but not independently actionable. May be added as a supporting dimension.

## Removed Metrics

The following metrics were previously tracked and have been removed because they did not produce reliable signal:

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
