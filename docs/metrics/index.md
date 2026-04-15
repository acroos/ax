# AX Metrics Reference 📊

AX tracks 17 metrics across four categories to give you the full picture of how well your agentic coding workflow is performing. Each metric has its own detailed doc — click through for the full story.

## Metric Categories

**🏗️ Output Quality** — Is the agent producing clean, mergeable work on the first try?

**💬 Prompt Efficiency** — How efficiently are prompts translating into completed work?

**🤖 Agent Behavior** — How well does the agent operate autonomously — reading, writing, recovering from errors?

**🗺️ Planning Effectiveness** — Does the plan match the implementation?

---

## All Metrics

| # | Metric | Category | Brief Description | Data Sources | Phase |
|---|--------|----------|-------------------|--------------|-------|
| 1 | [Messages per PR](./messages-per-pr.md) | Prompt Efficiency | Number of human messages in Claude Code sessions correlated to a PR | Session data | 2 |
| 2 | [Iteration Depth](./iteration-depth.md) | Prompt Efficiency | Count of back-and-forth turn pairs (user to agent) per task | Session data | 2 |
| 3 | [Post-Open Commits](./post-open-commits.md) | Output Quality | Commits landing after a PR was opened | Git, GitHub API | 1 |
| 4 | [First-Pass Acceptance Rate](./first-pass-acceptance-rate.md) | Output Quality | Percentage of PRs merged without reviewer change requests | GitHub Reviews API | 1 |
| 5 | [CI Success Rate](./ci-success-rate.md) | Output Quality | Percentage of commits/PRs passing CI on first push | GitHub Status Checks | 1 |
| 6 | [Diff Churn](./diff-churn.md) | Output Quality | Lines written then rewritten before merge — wasted effort signal | Git | 1 |
| 7 | [Test Coverage of Generated Code](./test-coverage-of-generated-code.md) | Output Quality | Whether PRs include corresponding test file changes | Git diff | 1 |
| 8 | [Line Revisit Rate](./line-revisit-rate.md) | Output Quality | How often the same lines are modified across different PRs | Git blame/diff | 1 |
| 9 | [Plan-to-Implementation Coverage](./plan-to-implementation-coverage.md) | Planning Effectiveness | How much of the final implementation was captured in the plan | Plan files, Git diff | 3 |
| 10 | [Plan Deviation Score](./plan-deviation-score.md) | Planning Effectiveness | Files planned vs files actually changed | Plan files, Git diff | 3 |
| 11 | [Scope Creep Detection](./scope-creep-detection.md) | Planning Effectiveness | Changes beyond what was originally asked for | Plan files, Git diff | 3 |
| 12 | [Self-Correction Rate](./self-correction-rate.md) | Agent Behavior | Agent-initiated fixes vs human-requested changes | Session data | 2 |
| 13 | [Context Efficiency](./context-efficiency.md) | Agent Behavior | Ratio of files read vs files modified | Session data | 2 |
| 14 | [Error Recovery Efficiency](./error-recovery-efficiency.md) | Agent Behavior | Attempts needed to resolve build/test/lint failures | Session data | 2 |
| 15 | [Token Cost per PR](./token-cost-per-pr.md) | Prompt Efficiency | Dollar cost of tokens consumed across sessions correlated to a PR | Session data, Pricing module | 2 |
| 16 | [Unmerged Token Spend](./unmerged-token-spend.md) | Prompt Efficiency | Total dollar cost of tokens on unmerged or uncorrelated work (repo-level) | Session data, PR merge status | 2 |
| 17 | [Review Cycle Time](./review-cycle-time.md) | Output Quality | Time from PR open to first human review comment | GitHub Events, Webhooks | 1 |

---

## Build Phases

### Phase 1 — Git and GitHub Data 🟢

Metrics calculated from git history, the GitHub API, and GitHub webhook events. No session data needed — these work the moment you install the GitHub App.

**Metrics:** Post-Open Commits, First-Pass Acceptance Rate, CI Success Rate, Diff Churn, Test Coverage of Generated Code, Line Revisit Rate, Review Cycle Time

### Phase 2 — Session Data 🟢

Metrics that use Claude Code session logs (messages, tool calls, token usage). These light up once you connect the CLI with `ax init`.

**Metrics:** Messages per PR, Iteration Depth, Self-Correction Rate, Context Efficiency, Error Recovery Efficiency, Token Cost per PR, Unmerged Token Spend

### Phase 3 — Plan Files 🔜

Metrics that compare plan documents against actual implementation. Requires a structured planning workflow.

**Metrics:** Plan-to-Implementation Coverage, Plan Deviation Score, Scope Creep Detection

---

## Deferred Metrics

These were considered but deferred. They may return in future iterations:

- **Time-to-Merge** — Conflates human review latency with agent quality; unreliable without normalization.
- **~~Token Usage per PR~~** — Raw token counts are noisy. Evolved into [Token Cost per PR](./token-cost-per-pr.md), which uses dollar cost with model-specific pricing.
- **Human Edit Rate** — Hard to distinguish style preference edits from correctness fixes without manual classification.
- **PR Size Distribution** — Useful as a normalizing dimension but not independently actionable. May be added as a supporting dimension.
