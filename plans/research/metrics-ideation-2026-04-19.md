# Metrics Ideation — 2026-04-19

## Context

Brainstorming session to identify new metrics that better measure team effectiveness with AI coding tools. The current 10-metric set (from ADR-015) skews toward measuring "how did the session go" — what's missing is the **before** (was the team set up for success?) and the **after** (did the output actually land well?).

### Guiding principles for new metrics

- **Effectiveness** can mean speed, quality, autonomy, or other things
- We should consider ingesting data from other tools if it yields better metrics
- Three exploration directions:
  1. AI coding best practices — how do we measure adherence?
  2. AI coding smells — how do we detect them?
  3. Product outcomes — how do we correlate outcomes to AI usage?

### Key insight from this session

The surviving metric candidates skew heavily toward **velocity** and **AI practices** rather than the current emphasis on output quality and agent behavior internals. This reflects a maturation in understanding — the tool is about measuring effectiveness with AI tooling, and the most interesting signals come from workflow patterns and delivery outcomes, not from internal agent telemetry.

---

## Rated Metrics (all current + all new candidates)

Each metric was independently rated 0-10 by the product owner (Austin) and by Claude, then averaged. Ratings reflect utility: actionability, uniqueness to AX, signal quality, and behavior-changing potential.

### Tier 1 — High conviction (avg 6.0+)

| Metric | Austin | Claude | Avg | Status | Category |
|--------|--------|--------|-----|--------|----------|
| Task Cycle Time | 8 | 9 | 8.5 | New | Velocity |
| Autonomy Score | 7 | 8 | 7.5 | Keep | Agent Behavior |
| Post-Open Commits | 7 | 6 | 6.5 | Keep | Output Quality |
| Iteration Depth | 6 | 7 | 6.5 | Keep | Prompt Efficiency |
| Peak Context Window % | 6 | 7 | 6.5 | New | AI Practices |
| PR Throughput | 6 | 6 | 6.0 | New | Velocity |

### Tier 2 — Promising, needs validation (avg 5.0-5.5)

| Metric | Austin | Claude | Avg | Status | Category |
|--------|--------|--------|-----|--------|----------|
| Skill/Custom Tool Usage | 6 | 5 | 5.5 | New | AI Practices |
| Subagent Delegation Rate | 6 | 5 | 5.5 | New | AI Practices |
| Rubber Stamp Rate | 5 | 6 | 5.5 | New | Output Quality |
| CI Success Rate | 5 | 5 | 5.0 | Keep | Output Quality |
| Code Survival Rate | 5 | 5 | 5.0 | New | Output Quality |

### Tier 3 — Low conviction / drop candidates (avg < 5.0)

| Metric | Austin | Claude | Avg | Status | Category |
|--------|--------|--------|-----|--------|----------|
| Review Cycle Time | 3.5 | 4 | 3.75 | Currently active | Output Quality |
| Line Revisit Rate | 3 | 4 | 3.5 | Currently active | Output Quality |
| Cache Hit Rate | 3 | 3 | 3.0 | Currently active | Prompt Efficiency |
| Token Cost per PR | 2 | 3 | 2.5 | Currently active | Prompt Efficiency |
| Re-Read Rate | 3 | 2 | 2.5 | Currently active | Agent Behavior |
| Concurrent Sessions | 2 | 3 | 2.5 | New | Velocity |
| CLAUDE.md Presence | 2 | 2 | 2.0 | New | AI Practices |
| Sidechain Rate | 1 | 2 | 1.5 | Currently active | Agent Behavior |
| Unmerged Token Spend | 0 | 1 | 0.5 | Currently active | Repo-level |

---

## Detailed Notes on Each Metric

### Task Cycle Time (NEW — avg 8.5)

**What:** Minutes from first session start to PR merged.

**Why it's exciting:** This is the first time in software engineering history we can actually measure "total time spent on a task." Before AI coding tools with session data, the closest proxy was first-commit-to-merge, which misses all time spent prompting, iterating, and debugging before the first commit. With session data, we capture the actual start of work.

**Data source:** Session timestamps (already collected) + PR merge timestamp (already collected). Fully derivable from existing data.

**Nuances:**
- Needs a throughput companion metric because "fast but zero parallelization" isn't necessarily good — it might be better to be slightly slower but 4x parallelized
- Also benefits from an autonomy metric alongside it — high cycle time + high autonomy might mean complex delegated work, not inefficiency
- Killer sales sentence: "Task cycle time went from 4 hours to 2 and PR throughput increased by 30%"

**Actionability:** Very high. Teams can directly see impact of process changes, better prompting, better context provision.

### Autonomy Score (KEEP — avg 7.5)

**What:** `assistant_messages / human_messages` — higher means the agent works more independently.

**Why it scored high:** Most "AI-native" metric in the current set. Directly measures what makes agentic coding different from autocomplete. High autonomy = engineer is trusting the agent with larger chunks of work = the whole point.

**Actionability:** High. "Try giving the agent more context upfront so it can do more without asking you." Also a great team-level adoption signal — team averaging 2.0 is using AI as a chatbot, team averaging 15.0 is actually delegating.

**Needs:** Better explanation/framing in the UI. The name "Autonomy Score" is good but the formula needs plain-language context.

### Post-Open Commits (KEEP — avg 6.5)

**What:** Commits pushed after PR was opened. Lower = cleaner first draft.

**Why it scored well:** Solid "didn't get the right output the first time" signal.

**Concern:** The number is very often 0, which means the distribution is heavily skewed. A metric that's almost always the same value doesn't drive conversations or trend analysis well. May need to be reframed or combined with something else.

### Iteration Depth (KEEP — avg 6.5)

**What:** Number of human turns (back-and-forth cycles) in the session.

**Why it scored well:** One of the most directly actionable metrics. High iteration depth means the prompt was unclear, the task was underspecified, or the engineer is micromanaging. All correctable. Natural coaching metric: "your p75 iteration depth is 12, the team average is 6, let's look at how you're prompting."

**Note:** Austin isn't seeing a lot of variance in his own data, but expects other engineers will. Low variance for experienced users may actually validate the metric — it differentiates skill levels.

### Peak Context Window % (NEW — avg 6.5)

**What:** p50/p75/p90 of how full the context window gets during sessions.

**Why it's interesting:** Hitting high % of context window often signals (1) doing too much in one session and (2) probably not getting as good output as you could. Quality degradation at high context usage is real and well-documented.

**Data source:** Session data — would need to be added to the CLI's session parsing. Austin is already measuring this in the seshql project (`~/dev/seshql`).

**Actionability:** Directly actionable — "break this into smaller sessions" or "delegate more to subagents." Also a leading indicator — you can catch the problem mid-session rather than only seeing it in outcomes after the PR ships.

### PR Throughput (NEW — avg 6.0)

**What:** Merged PRs per contributor per week, split by AI-assisted vs. not.

**Why it scored where it did:** Common data on its own (GitHub insights shows merge frequency), but the AI-assisted vs. not split is unique to AX. It's the volume companion to Task Cycle Time's speed measurement. Together they tell the full velocity story.

**Framing:** This is the velocity "volume" metric. Engineers can parallelize multiple tasks with AI, and this captures whether teams are actually doing that.

### Skill/Custom Tool Usage (NEW — avg 5.5)

**What:** Are teams building and using custom skills, MCP servers, slash commands?

**Why it's interesting:** Points toward advancement in sophistication of AI usage. Combined with other metrics, should correlate with better or more efficient outputs.

**Concerns:** Measurement is tricky — using `/commit` is trivial, building a custom MCP server is advanced. They shouldn't score the same. Might work better as a qualitative tier ("basic / intermediate / advanced usage") than a continuous metric. Some teams have great workflows with zero custom tooling.

### Subagent Delegation Rate (NEW — avg 5.5)

**What:** Fraction of tool calls delegated to subagents vs. executed on the main thread.

**Why it's interesting:** Obviously actionable (delegate git/gh/web calls to haiku subagents). Both a quality practice (cleaner main context) and a cost practice (haiku is ~60x cheaper on input tokens than opus).

**Concerns:** Has a shelf life — once a team is doing it, the number flatlines and stops being interesting. Might work better as a component of a broader "AI practices" composite score than a standalone metric. Austin described it as "once you've gotten to a certain point it's more of a smoke test."

### Rubber Stamp Rate (NEW — avg 5.5)

**What:** PRs approved suspiciously fast relative to their size (diff size / review time).

**Why it's interesting:** One of the few metrics addressing the risk side of AI adoption. Most metrics measure "are we using AI well" — this asks "are we cutting corners because AI made us fast." It's a counterbalance.

**Key decision:** All rubber stamping is bad, not just on AI-assisted PRs. AI has increased its prevalence through sheer PR volume increase. However, this may be "regressive thinking" — as release safety improves (extensive CI, staging, feature flags, canary deploys), fast approvals may become fine because the safety net catches problems. For now: rubber stamp rate is a smell, period.

**Implementation:** Simple formula — `diff_size / review_time_minutes` with a threshold. Data is already available from GitHub.

### CI Success Rate (KEEP — avg 5.0)

**What:** Fraction of commits on the PR that passed all CI check suites.

**Assessment:** Somewhat overlaps with Post-Open Commits (you'll have to push another commit if CI fails). Not hard-to-find data, not unique to AX. But it is useful to know if agents are regularly pushing code that fails tests. The differentiating angle would be comparing CI pass rates for AI-assisted vs. manual PRs, but that comparison isn't surfaced today.

### Code Survival Rate (NEW — avg 5.0)

**What:** % of lines from AI-assisted PRs that survive 30/60/90 days without being rewritten.

**Assessment:** The signal is real at scale — if Team A's code survival is 85% and Team B's is 45%, that's meaningful. High velocity + low survival = "shipping fast but it's not sticking." However:
- Prerequisites are steep: mature codebase, high PR volume, 30-90 days of history
- Doesn't work for greenfield projects
- Rewrites aren't inherently bad — sometimes you just needed to ship something
- Measurement complexity (blame analysis at scale) is real
- For early customers (likely smaller, more greenfield), it's dead weight

**Verdict:** A "turn on at scale" metric, not a day-one metric. Consider for future roadmap once data density is sufficient.

### Review Cycle Time (CURRENTLY ACTIVE — avg 3.75)

**What:** Minutes from PR open to first human review.

**Assessment:** It's a process bottleneck metric, not an AI effectiveness metric. Tells you about team review culture, not AI usage quality. Task Cycle Time subsumes it as part of the end-to-end story. Already available in GitHub's built-in PR analytics. One interesting angle: could indicate teams are parallelizing too much with AI, causing PRs to sit unreviewed.

### Line Revisit Rate (CURRENTLY ACTIVE — avg 3.5)

**What:** Files in this PR that were also changed in other PRs finalized within the last 7 days.

**Assessment:** The concept is sound (code churn signals instability) but it's not AI-specific. Tools like CodeClimate already surface this. Meaningless for smaller or greenfield teams. Hard to act on — "you changed files that were recently changed" doesn't tell you what to do differently. Austin: "not behavior-changing."

### Cache Hit Rate (CURRENTLY ACTIVE — avg 3.0)

**What:** Ratio of cache-read tokens to total input tokens.

**Assessment:** Technical efficiency metric that most engineers and leaders won't know how to act on. "Your cache hit rate is 0.4" — then what? It's almost an implementation detail of the model provider. If it belonged anywhere, it would be a sub-component of a broader context hygiene score, not a standalone metric.

### Token Cost per PR (CURRENTLY ACTIVE — avg 2.5)

**What:** Dollar cost of all tokens used, computed with model-specific pricing.

**Assessment:** Raw dollar number is uninteresting because it varies wildly by task complexity and there's no "right" cost. Becomes less meaningful as model prices drop. The composition of cost (e.g., are you using haiku subagents for simple tasks?) is far more interesting than the total. Austin: "I'm so much more interested in if we're spending money on silly things." Some orgs with strict AI budgets may still want to see the number.

### Re-Read Rate (CURRENTLY ACTIVE — avg 2.5)

**What:** `total_file_reads / unique_files_read`.

**Assessment:** Fails the actionability test — neither Austin nor Claude could articulate what you'd do to improve this metric. Re-reading might be perfectly rational for complex changes. It's mostly a function of agent behavior and codebase structure, neither of which the engineer controls in the moment.

### Concurrent Sessions (NEW — avg 2.5)

**What:** How many sessions does a contributor have active in overlapping time windows?

**Assessment:** Descriptive, not prescriptive. A developer running 5 concurrent sessions might be an expert parallelizer or might be thrashing. Without knowing outcomes, the raw number says nothing. The parallelization story is better captured by PR Throughput — output volume speaks for itself.

### CLAUDE.md Presence/Freshness (NEW — avg 2.0)

**What:** Does the repo have a CLAUDE.md, how recently was it updated?

**Assessment:** Table stakes at this point. It's a checkbox, not a metric. Freshness is misleading — a CLAUDE.md that hasn't changed in 3 months might be stable and well-written, not neglected.

### Sidechain Rate (CURRENTLY ACTIVE — avg 1.5)

**What:** Fraction of messages on sidechain branches (backtracking).

**Assessment:** If the product's own builder doesn't understand what it means, users won't either. The underlying concept (dead-end paths) is theoretically interesting, but "sidechain" is opaque terminology. Not clear what a team should do if this is high — is it the human's fault or the agent's fault? Not actionable.

### Unmerged Token Spend (CURRENTLY ACTIVE — avg 0.5)

**What:** Dollar cost of tokens spent on PRs that were never merged. Repo-level.

**Assessment:** Sounds good in theory ("measure waste!") but closed PRs aren't waste — they're exploration, spikes, abandoned approaches that informed what did ship. Inherits all problems of Token Cost per PR. Only useful for catching pathological patterns ("50% of AI spend goes to PRs that never merge") which is rare enough to not warrant a permanent metric. Austin's rating: 0.

---

## Rejected Metric Ideas (with rationale)

### Session ROI (lines shipped per dollar spent)
**Rejected because:** Lines of code is a fundamentally broken proxy for value. A 3-line config fix from an intense debugging session may be 10x more valuable than a 200-line feature. The cost side is already captured by Token Cost per PR. Trying to measure "value delivered" per session is a rabbit hole with no clean denominator.

### Context Reset Rate (sessions restarted on same branch/PR)
**Rejected because:** Probably too rare to generate meaningful data. Would almost always be green/zero, making it noise rather than signal.

### Delegation Cost Savings (estimated cost if subagent calls had stayed on main context)
**Not explicitly rated but discussed.** Interesting concept — could show teams how much money they're saving by delegating to haiku. May be worth revisiting if Subagent Delegation Rate makes the cut, as a derived insight rather than a standalone metric.

### Main Context Efficiency (useful work tokens / total main context tokens)
**Discussed but not rated.** Hard to define "useful work tokens" cleanly.

---

## Possible New Category Structure

If the top-rated metrics were adopted, the category structure would shift:

**Current (ADR-015):**
- Output Quality (4 metrics)
- Prompt Efficiency (3 metrics)
- Agent Behavior (3 metrics)
- Repo-level (1 metric)

**Proposed direction:**
- **Velocity** — Task Cycle Time, PR Throughput
- **Output Quality** — Post-Open Commits, Rubber Stamp Rate, CI Success Rate (maybe Code Survival Rate at scale)
- **AI Practices** — Peak Context Window %, Autonomy Score, Iteration Depth, Skill/Custom Tool Usage, Subagent Delegation Rate
- **Prompt Efficiency** — potentially collapsed into AI Practices

This reflects the insight that the most valuable metrics measure workflow patterns and delivery outcomes, not internal agent telemetry.

---

## New Data Sources Discussed

| Source | What it enables | Feasibility |
|--------|----------------|-------------|
| Session timestamps | Task Cycle Time (first session start → PR merge) | Already collected |
| Session context window data | Peak Context Window % | Would need CLI parsing addition; Austin has prototype in seshql |
| Session tool call data | Subagent Delegation Rate, Skill/Custom Tool Usage | Would need CLI parsing addition |
| GitHub PR size + review timing | Rubber Stamp Rate | Already available from existing GitHub integration |
| Git blame analysis | Code Survival Rate | New capability needed — CLI-side or server-side job via GitHub API |
| Issue trackers (Linear, Jira) | Defect Correlation (discussed but not rated) | New integration required |

---

## Open Questions

1. **Where's the cut line?** Austin wants to keep Tier 2 (5.0+) metrics as well. That gives 11 metrics — close to the current 10 and avoids re-bloating.
2. **Should some metrics be composites?** Cache Hit Rate, Subagent Delegation Rate, and CLAUDE.md Presence might work better as components of a single "AI Practices Score" than as standalone metrics.
3. **How to handle metrics that are "always green" for advanced users?** Some metrics (Subagent Delegation, Iteration Depth) flatten out as teams mature. Consider whether these should auto-hide or move to a "health check" section.
4. **Code Survival Rate timing:** When does the customer base have enough data density to make this worthwhile?
5. **Previously pruned metrics:** The 10 metrics removed in ADR-015 should also be reconsidered through this new lens — see next exercise.

---

## Previously Pruned Metrics (ADR-015) — Re-evaluated

These 10 metrics were removed in ADR-015. We re-evaluated them through the lens of "does this help teams understand AI coding effectiveness?"

### Ratings

| Metric | Austin | Claude | Avg | Notes |
|--------|--------|--------|-----|-------|
| Plan-to-Implementation Coverage | 4 | 5 | 4.5 | Best of the plan metrics — "did you do what you said you'd do?" |
| First-Pass Acceptance Rate | 4.5 | 4 | 4.25 | Potentially interesting but review semantics vary by team |
| Scope Creep Detection | 4 | 4 | 4.0 | Files changed that weren't in the plan — actionable if plan ingestion is solved |
| Plan Deviation Score | 4 | 4 | 4.0 | Mushier version of Coverage + Scope Creep combined |
| Context Efficiency | 2 | 2 | 2.0 | Ghost of a good idea, but Peak Context Window % captures it better |
| Test Coverage of Generated Code | 1 | 1 | 1.0 | Not our lane — Codecov etc. do this better |
| Diff Churn | 1 | 1 | 1.0 | Designed for human multi-commit workflows, not agentic single-commit patterns |
| Messages per PR | 1 | 1 | 1.0 | Redundant with Iteration Depth, which is strictly better |
| Self-Correction Rate | 1 | 1 | 1.0 | Bash success/error counts too coarse; user can't act on it |
| Error Recovery Efficiency | 1 | 1 | 1.0 | Same problems as Self-Correction Rate |

### Key Takeaways

**The plan metrics (Coverage, Scope Creep, Deviation) are the only ones with potential life.** Their original failure was the extraction mechanism (regex on backtick-wrapped paths in plan files), not the concept. If structured plan ingestion becomes feasible — through Claude Code's plan mode, Linear ticket descriptions, or another structured input — Coverage and Scope Creep are the two worth revisiting. They answer "did you do what you planned?" and "did you do stuff you didn't plan?" respectively.

**Everything else was correctly killed.** The bash-derived metrics (Self-Correction, Error Recovery, Context Efficiency) measured agent internals that users have no lever to pull on. Test Coverage isn't our lane. Diff Churn and Messages per PR don't map to agentic workflows. First-Pass Acceptance is conceptually close to Rubber Stamp Rate but from the opposite direction and blunter.

**Conditional roadmap item:** If/when AX supports structured plan ingestion, revisit Plan-to-Implementation Coverage and Scope Creep Detection as a pair. They could form a "Planning Effectiveness" sub-category, but only with reliable plan parsing — the regex approach should not be retried.
