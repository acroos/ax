# Review Cycle Time

## What it measures

Time elapsed from when a PR is opened until the first human review comment is submitted. Measured in minutes.

This metric captures how quickly developers receive feedback on their work. Lower times indicate faster feedback loops and better developer flow state.

## Why it matters

Code review cycle time is a critical component of developer experience:

- **Flow state**: Developers work best with tight feedback loops. Long waits for review create context-switching overhead.
- **Unblock velocity**: Long review times delay PR merges and keep work in-flight longer.
- **Team communication**: Fast reviews signal an engaged, responsive team.

Industry data shows healthy review cycle time (time to first review) is typically **under 4 hours** for best developer experience.

## How it's calculated

```
Review Cycle Time (minutes) = 
  (first_review_submitted_at - pr_opened_at) / 60
```

- **Captured on**: First human review (excludes bot reviews like Dependabot)
- **Null when**: No reviews have been submitted yet (PR still open)
- **Updates**: Once captured, the metric is locked at PR finalization (merge/close)

## Interpretation

| Range | Interpretation |
|-------|---|
| < 4 hours | Excellent feedback loop — reviewer engagement is strong |
| 4-8 hours | Good — typical for asynchronous teams, some waiting |
| 8-24 hours | Slower — review latency may be delaying merges |
| > 24 hours | Bottleneck — significant review delays; may indicate understaffing or review culture issues |

## What affects this metric

**Increases cycle time:**
- Small team size relative to PR volume
- Async-first culture without dedicated review windows
- Time zone distribution requiring async reviews
- High PR volume overwhelming reviewers
- Developers working odd hours (off-peak reviews)

**Decreases cycle time:**
- Synchronous pair programming or code review pairing
- Dedicated review windows (e.g., morning sync)
- Clear code review SLAs
- Good test coverage reducing review scope
- Small, focused PRs (easier to review quickly)

## Caveats

- **Timing artifacts**: This metric measures wall-clock time, which includes nights, weekends, and holidays. A PR opened Friday evening and reviewed Monday morning may show 2-3 days of cycle time even if the reviewer was responsive during business hours.
- **Bot reviews excluded**: Only human reviews (type=User) are counted. Comments from bots like Dependabot do not count as "first review."
- **No business hours adjustment**: Currently includes all 24 hours. Future versions may support business-hours normalization for distributed teams.
- **Single data point**: This metric captures one moment (first review). If reviews are delayed due to review complexity, this metric may reflect that. Consider pairing with review comment density to understand review quality.

## Related metrics

- **First-Pass Acceptance** — Quality of reviews, not speed
- **Post-Open Commits** — How much rework happened after PR opened (possibly due to review feedback)
