import { describe, it, expect } from "vitest";
import {
  computeAggregatesFromPRs,
  getPRSize,
  orgApiPath,
  type PRWithMetrics,
} from "../db";

// ---------------------------------------------------------------------------
// Helper to build PRWithMetrics fixtures
// ---------------------------------------------------------------------------

function makePR(overrides: Partial<PRWithMetrics> = {}): PRWithMetrics {
  return {
    id: 1,
    repo_id: 1,
    number: 100,
    title: "Test PR",
    branch: "feature",
    state: "merged",
    created_at: "2026-01-01T00:00:00Z",
    merged_at: "2026-01-02T00:00:00Z",
    closed_at: null,
    url: null,
    additions: 50,
    deletions: 20,
    changed_files: 3,
    metrics: null,
    author: "testuser",
    github_owner: "org",
    github_repo: "repo",
    session_count: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeAggregatesFromPRs
// ---------------------------------------------------------------------------

describe("computeAggregatesFromPRs", () => {
  it("returns zeros for empty array", () => {
    const result = computeAggregatesFromPRs([]);
    expect(result.totalPRs).toBe(0);
    expect(result.sessionDataCount).toBe(0);
    expect(result.metrics["post-open-commits"].current).toBeNull();
    expect(result.metrics["ci-success-rate"].current).toBeNull();
  });

  it("handles PRs with no metrics", () => {
    const prs = [makePR(), makePR({ id: 2 })];
    const result = computeAggregatesFromPRs(prs);
    expect(result.totalPRs).toBe(2);
    expect(result.sessionDataCount).toBe(0);
    expect(result.metrics["post-open-commits"].current).toBeNull();
  });

  it("handles PRs where all metric values are null", () => {
    const prs = [
      makePR({
        metrics: {
          pr_id: 1,
          iteration_depth: null,
          post_open_commits: null,
          ci_success_rate: null,
          line_revisit_rate: null,
          token_cost_usd: null,
          cache_hit_rate: null,
          sidechain_rate: null,
          re_read_rate: null,
          autonomy_score: null,
          metrics_finalized: false,
          finalized_at: null,
        },
      }),
    ];
    const result = computeAggregatesFromPRs(prs);
    expect(result.totalPRs).toBe(1);
    expect(result.sessionDataCount).toBe(0);
    expect(result.metrics["post-open-commits"].current).toBeNull();
  });

  it("computes averages for a single PR", () => {
    const prs = [
      makePR({
        metrics: {
          pr_id: 1,
          iteration_depth: 5,
          post_open_commits: 2,
          ci_success_rate: 0.8,
          line_revisit_rate: 1.5,
          token_cost_usd: 3.50,
          cache_hit_rate: 0.6,
          sidechain_rate: 0.1,
          re_read_rate: 2.0,
          autonomy_score: 7.5,
          metrics_finalized: true,
          finalized_at: "2026-01-02T00:00:00Z",
        },
      }),
    ];
    const result = computeAggregatesFromPRs(prs);
    expect(result.totalPRs).toBe(1);
    expect(result.sessionDataCount).toBe(1);
    expect(result.metrics["post-open-commits"].current).toBe(2);
    expect(result.metrics["ci-success-rate"].current).toBe(0.8);
    expect(result.metrics["line-revisit-rate"].current).toBe(1.5);
  });

  it("computes averages across multiple PRs", () => {
    const metrics1 = {
      pr_id: 1,
      iteration_depth: 4,
      post_open_commits: 2,
      ci_success_rate: 0.8,
      line_revisit_rate: 1.0,
      token_cost_usd: 2.00,
      cache_hit_rate: 0.5,
      sidechain_rate: 0.2,
      re_read_rate: 1.0,
      autonomy_score: 6.0,
      metrics_finalized: true,
      finalized_at: "2026-01-02T00:00:00Z",
    };
    const metrics2 = {
      pr_id: 2,
      iteration_depth: 6,
      post_open_commits: 4,
      ci_success_rate: 1.0,
      line_revisit_rate: 2.0,
      token_cost_usd: 4.00,
      cache_hit_rate: 0.7,
      sidechain_rate: 0.0,
      re_read_rate: 3.0,
      autonomy_score: 8.0,
      metrics_finalized: true,
      finalized_at: "2026-01-03T00:00:00Z",
    };
    const prs = [
      makePR({ id: 1, metrics: metrics1 }),
      makePR({ id: 2, metrics: metrics2 }),
    ];
    const result = computeAggregatesFromPRs(prs);
    expect(result.totalPRs).toBe(2);
    expect(result.sessionDataCount).toBe(2);
    expect(result.metrics["post-open-commits"].current).toBe(3);
    expect(result.metrics["ci-success-rate"].current).toBe(0.9);
    expect(result.metrics["line-revisit-rate"].current).toBe(1.5);
  });

  it("ignores null metric values when averaging", () => {
    const prs = [
      makePR({
        id: 1,
        metrics: {
          pr_id: 1,
          iteration_depth: 4,
          post_open_commits: null,
          ci_success_rate: 0.8,
          line_revisit_rate: null,
          token_cost_usd: 2.00,
          cache_hit_rate: null,
          sidechain_rate: null,
          re_read_rate: null,
          autonomy_score: null,
          metrics_finalized: true,
          finalized_at: null,
        },
      }),
      makePR({
        id: 2,
        metrics: {
          pr_id: 2,
          iteration_depth: 6,
          post_open_commits: 3,
          ci_success_rate: 1.0,
          line_revisit_rate: null,
          token_cost_usd: null,
          cache_hit_rate: null,
          sidechain_rate: null,
          re_read_rate: null,
          autonomy_score: null,
          metrics_finalized: true,
          finalized_at: null,
        },
      }),
    ];
    const result = computeAggregatesFromPRs(prs);
    // post_open_commits: only PR2 has a value (3)
    expect(result.metrics["post-open-commits"].current).toBe(3);
    // ci_success_rate: average of 0.8 and 1.0 = 0.9
    expect(result.metrics["ci-success-rate"].current).toBe(0.9);
    // line_revisit_rate: both null
    expect(result.metrics["line-revisit-rate"].current).toBeNull();
    // sessionDataCount: only PR1 has token_cost_usd
    expect(result.sessionDataCount).toBe(1);
  });

  it("always returns null for prior and empty sparkline", () => {
    const prs = [
      makePR({
        metrics: {
          pr_id: 1,
          iteration_depth: 3,
          post_open_commits: 1,
          ci_success_rate: 0.9,
          line_revisit_rate: 0.5,
          token_cost_usd: 1.50,
          cache_hit_rate: 0.4,
          sidechain_rate: 0.05,
          re_read_rate: 0.8,
          autonomy_score: 9.0,
          metrics_finalized: true,
          finalized_at: null,
        },
      }),
    ];
    const result = computeAggregatesFromPRs(prs);
    for (const slug of Object.keys(result.metrics)) {
      expect(result.metrics[slug].prior).toBeNull();
      expect(result.metrics[slug].sparkline).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// getPRSize
// ---------------------------------------------------------------------------

describe("getPRSize", () => {
  it("returns XS for 0 changes", () => {
    expect(getPRSize(0, 0)).toBe("XS");
  });

  it("returns XS for exactly 10 total changes", () => {
    expect(getPRSize(5, 5)).toBe("XS");
  });

  it("returns S for 11 total changes", () => {
    expect(getPRSize(10, 1)).toBe("S");
  });

  it("returns S for exactly 100 total changes", () => {
    expect(getPRSize(80, 20)).toBe("S");
  });

  it("returns M for 101 total changes", () => {
    expect(getPRSize(100, 1)).toBe("M");
  });

  it("returns M for exactly 500 total changes", () => {
    expect(getPRSize(400, 100)).toBe("M");
  });

  it("returns L for 501 total changes", () => {
    expect(getPRSize(500, 1)).toBe("L");
  });

  it("returns L for exactly 1000 total changes", () => {
    expect(getPRSize(800, 200)).toBe("L");
  });

  it("returns XL for 1001 total changes", () => {
    expect(getPRSize(1000, 1)).toBe("XL");
  });

  it("returns XL for very large changes", () => {
    expect(getPRSize(5000, 5000)).toBe("XL");
  });
});

// ---------------------------------------------------------------------------
// orgApiPath
// ---------------------------------------------------------------------------

describe("orgApiPath", () => {
  it("constructs org-scoped API path", () => {
    expect(orgApiPath("my-org", "/repos")).toBe("/api/v1/orgs/my-org/repos");
  });

  it("handles nested paths", () => {
    expect(orgApiPath("acme", "/teams/platform/prs")).toBe(
      "/api/v1/orgs/acme/teams/platform/prs",
    );
  });
});
