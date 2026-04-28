/**
 * Mock data for MOCK_DATA=true mode.
 * All data is deterministic (seeded PRNG, fixed reference date).
 * ~150 PRs across 3 repos, 30-day sparklines, realistic metric distributions.
 */

import type { CurrentUser } from "@/lib/auth";
import type {
  Repo,
  PRWithMetrics,
  PRMetrics,
  SessionWithMetrics,
  AggregateMetrics,
  SparklinePoint,
  MetricAggregate,
  TimelinePoint,
  BillingInfo,
  GithubInstallationResponse,
  Team,
  TeamDetail,
  TeamMember,
} from "@/lib/db";
import { ALL_AGENTS } from "@/lib/agents.gen";

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across hot reloads
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
function randFloat(min: number, max: number) {
  return min + rand() * (max - min);
}
function randInt(min: number, max: number) {
  return Math.floor(min + rand() * (max + 1 - min));
}
// Fixed reference date so timestamps don't shift across reloads
const REF = new Date("2026-04-15T18:00:00Z");
function daysAgo(n: number): string {
  const d = new Date(REF);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Mock user
// ---------------------------------------------------------------------------

export const MOCK_USER: CurrentUser = {
  id: 1,
  github_username: "austinroos",
  display_name: "Austin Roos",
  email: "austin@acme-eng.dev",
  avatar_url: null,
  organizations: [
    { slug: "acme-eng", name: "Acme Engineering", is_personal: false, plan: "pro" },
    { slug: "austinroos", name: "Austin Roos", is_personal: true, plan: "free" },
  ],
};

// ---------------------------------------------------------------------------
// Mock repos
// ---------------------------------------------------------------------------

export const MOCK_REPOS: Repo[] = [
  { id: 1, path: "acme-eng/web-app", remote_url: "https://github.com/acme-eng/web-app.git", github_owner: "acme-eng", github_repo: "web-app", last_synced_at: daysAgo(0) },
  { id: 2, path: "acme-eng/api-server", remote_url: "https://github.com/acme-eng/api-server.git", github_owner: "acme-eng", github_repo: "api-server", last_synced_at: daysAgo(0) },
  { id: 3, path: "acme-eng/mobile-sdk", remote_url: "https://github.com/acme-eng/mobile-sdk.git", github_owner: "acme-eng", github_repo: "mobile-sdk", last_synced_at: daysAgo(1) },
];

// ---------------------------------------------------------------------------
// Mock PRs (~150 total, ~50 per repo)
// ---------------------------------------------------------------------------

const PR_TITLES = [
  "Fix race condition in auth middleware",
  "Add caching layer for user sessions",
  "Refactor payment processing flow",
  "Update onboarding wizard copy",
  "Migrate to new logging framework",
  "Fix timezone handling in date picker",
  "Add retry logic for webhook delivery",
  "Improve search result ranking",
  "Remove deprecated API endpoints",
  "Add dark mode support to settings",
  "Fix memory leak in WebSocket handler",
  "Optimize database query for dashboard",
  "Add rate limiting to public API",
  "Update dependencies to latest patch",
  "Fix CSS overflow in mobile nav",
  "Add export to CSV feature",
  "Implement soft delete for projects",
  "Fix flaky integration test suite",
  "Add SSO configuration page",
  "Refactor notification preferences",
  "Fix pagination cursor drift",
  "Add bulk action toolbar to list view",
  "Optimize image upload pipeline",
  "Fix OAuth token refresh flow",
  "Add Prometheus metrics endpoint",
  "Refactor error boundary hierarchy",
  "Fix i18n pluralization rules",
  "Add workspace invitation flow",
  "Optimize GraphQL resolver N+1",
  "Fix file upload size validation",
  "Add changelog generation script",
  "Refactor state management to Zustand",
  "Fix CORS headers for preflight",
  "Add audit log for admin actions",
  "Optimize cold start in serverless",
  "Fix scroll restoration on back nav",
  "Add keyboard shortcuts modal",
  "Refactor test fixtures to factories",
  "Fix email template rendering",
  "Add feature flag management UI",
  "Optimize bundle size with tree shaking",
  "Fix dropdown z-index stacking",
  "Add real-time collaboration cursor",
  "Refactor API client error handling",
  "Fix webhook signature verification",
  "Add custom domain support",
  "Optimize Redis connection pooling",
  "Fix table sort state persistence",
  "Add progressive image loading",
  "Refactor form validation library",
];

const BRANCHES = [
  "fix/auth-race", "feat/session-cache", "refactor/payments", "update/onboarding-copy",
  "migrate/logging", "fix/timezone-picker", "feat/webhook-retry", "improve/search-ranking",
  "chore/remove-deprecated", "feat/dark-mode-settings", "fix/ws-memory-leak", "optimize/dashboard-query",
  "feat/rate-limit", "chore/deps-update", "fix/mobile-nav-overflow", "feat/csv-export",
  "feat/soft-delete", "fix/flaky-tests", "feat/sso-config", "refactor/notification-prefs",
  "fix/pagination-cursor", "feat/bulk-actions", "optimize/image-upload", "fix/oauth-refresh",
  "feat/prometheus", "refactor/error-boundaries", "fix/i18n-plurals", "feat/invitations",
  "optimize/graphql-n1", "fix/upload-validation", "feat/changelog-gen", "refactor/zustand",
  "fix/cors-preflight", "feat/audit-log", "optimize/cold-start", "fix/scroll-restore",
  "feat/keyboard-shortcuts", "refactor/test-fixtures", "fix/email-templates", "feat/feature-flags",
  "optimize/bundle-size", "fix/dropdown-zindex", "feat/collab-cursors", "refactor/api-client",
  "fix/webhook-sig", "feat/custom-domains", "optimize/redis-pool", "fix/table-sort",
  "feat/progressive-images", "refactor/form-validation",
];

const MOCK_AUTHORS = ["austinroos", "jamiekwon", "sammori", "alexchen"];

function generatePR(id: number, repoId: number): PRWithMetrics {
  const titleIdx = (id - 1) % PR_TITLES.length;
  const daysBack = randInt(0, 59);
  const isMerged = rand() > 0.15; // 85% merged
  const createdAt = daysAgo(daysBack);
  const mergedAt = isMerged ? daysAgo(Math.max(0, daysBack - randInt(0, 3))) : null;
  const closedAt = isMerged ? null : daysAgo(Math.max(0, daysBack - randInt(0, 3)));
  const state = isMerged ? "merged" : "closed";
  const repo = MOCK_REPOS.find((r) => r.id === repoId)!;
  const additions = randInt(5, 800);
  const deletions = randInt(2, 300);
  const author = MOCK_AUTHORS[id % MOCK_AUTHORS.length];

  // Most PRs have metrics; ~5% don't (to test empty states)
  const hasMetrics = rand() > 0.05;
  const hasSessionData = hasMetrics && rand() > 0.2;

  const metrics: PRMetrics | null = hasMetrics
    ? {
        pr_id: id,
        post_open_commits: Math.round(randFloat(0, 5)),
        ci_success_rate: rand() > 0.1 ? Math.round(randFloat(0.5, 1.0) * 100) / 100 : null,
        line_revisit_rate: Math.round(randFloat(0.0, 0.5) * 100) / 100,
        iteration_depth: Math.round(randFloat(1, 14)),
        total_tokens: hasSessionData ? randInt(20_000, 450_000) : null,
        cache_hit_rate: hasSessionData ? Math.round(randFloat(0.25, 0.92) * 100) / 100 : null,
        sidechain_rate: hasSessionData ? Math.round(randFloat(0.02, 0.28) * 100) / 100 : null,
        re_read_rate: hasSessionData ? Math.round(randFloat(0.8, 3.8) * 100) / 100 : null,
        autonomy_score: hasSessionData ? Math.round(randFloat(2.0, 15.0) * 10) / 10 : null,
        task_cycle_time_hours: hasSessionData ? Math.round(randFloat(0.5, 48.0) * 10) / 10 : null,
        pr_throughput: Math.round(randFloat(1.0, 8.0) * 10) / 10,
        peak_context_pct: hasSessionData ? Math.round(randFloat(0.1, 0.95) * 100) / 100 : null,
        skill_tool_usage: hasSessionData ? Math.round(randFloat(0.0, 0.3) * 100) / 100 : null,
        subagent_delegation: hasSessionData ? Math.round(randFloat(0.0, 0.5) * 100) / 100 : null,
        rubber_stamp_rate: isMerged && additions + deletions >= 50
          ? (rand() < 0.15 ? 1.0 : 0.0)
          : 0.0,
        metrics_finalized: true,
        finalized_at: mergedAt ?? daysAgo(Math.max(0, daysBack - 1)),
      }
    : null;

  return {
    id,
    repo_id: repoId,
    number: 100 + id,
    title: PR_TITLES[titleIdx],
    branch: BRANCHES[titleIdx],
    state,
    created_at: createdAt,
    merged_at: mergedAt,
    closed_at: closedAt,
    url: `https://github.com/${repo.github_owner}/${repo.github_repo}/pull/${100 + id}`,
    additions,
    deletions,
    changed_files: randInt(1, 30),
    author,
    github_owner: repo.github_owner,
    github_repo: repo.github_repo,
    session_count: hasSessionData ? randInt(1, 4) : 0,
    metrics,
  };
}

// Generate ~50 PRs per repo = 150 total
export const MOCK_PRS: PRWithMetrics[] = (() => {
  const prs: PRWithMetrics[] = [];
  let id = 1;
  for (const repo of MOCK_REPOS) {
    for (let i = 0; i < 50; i++) {
      prs.push(generatePR(id++, repo.id));
    }
  }
  return prs;
})();

// ---------------------------------------------------------------------------
// Mock aggregate metrics with sparklines
// ---------------------------------------------------------------------------

type SparklineConfig = {
  base: number;
  trend: number;
  noise: number;
  clampMin?: number;
  clampMax?: number;
};

function generateSparkline(cfg: SparklineConfig, days = 30): SparklinePoint[] {
  const points: SparklinePoint[] = [];
  for (let i = 0; i < days; i++) {
    const raw = cfg.base + cfg.trend * (i / (days - 1)) + (rand() - 0.5) * cfg.noise;
    const clamped = Math.min(cfg.clampMax ?? Infinity, Math.max(cfg.clampMin ?? -Infinity, raw));
    points.push({
      t: daysAgo(days - 1 - i),
      v: Math.round(clamped * 1000) / 1000,
    });
  }
  return points;
}

function aggregateFromSparkline(sparkline: SparklinePoint[], windowDays = 30): MetricAggregate {
  const currentSlice = sparkline.slice(-windowDays).map((p) => p.v).filter((v): v is number => v !== null);
  const priorSlice = sparkline.slice(-windowDays * 2, -windowDays).map((p) => p.v).filter((v): v is number => v !== null);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const current = avg(currentSlice);
  const prior = avg(priorSlice);
  return {
    current: current !== null ? Math.round(current * 100) / 100 : null,
    prior: prior !== null ? Math.round(prior * 100) / 100 : null,
    sparkline,
  };
}

const SPARKLINE_CONFIGS: Record<string, SparklineConfig> = {
  "post-open-commits": { base: 2.0, trend: -0.6, noise: 0.8, clampMin: 0 },
  "ci-success-rate": { base: 0.76, trend: 0.08, noise: 0.06, clampMin: 0, clampMax: 1 },
  "line-revisit-rate": { base: 0.14, trend: 0.02, noise: 0.06, clampMin: 0 },
  "iteration-depth": { base: 9, trend: -1.5, noise: 2.5, clampMin: 1 },
  "token-cost-per-pr": { base: 180000, trend: 30000, noise: 60000, clampMin: 10000 },
  "cache-hit-rate": { base: 0.58, trend: 0.1, noise: 0.06, clampMin: 0, clampMax: 1 },
  "sidechain-rate": { base: 0.16, trend: -0.05, noise: 0.04, clampMin: 0, clampMax: 1 },
  "re-read-rate": { base: 1.8, trend: -0.2, noise: 0.4, clampMin: 0 },
  "autonomy-score": { base: 6.5, trend: 1.5, noise: 1.2, clampMin: 0 },
  "task-cycle-time": { base: 12.0, trend: -3.0, noise: 4.0, clampMin: 0.5 },
  "pr-throughput": { base: 3.2, trend: 0.8, noise: 0.6, clampMin: 0.5 },
  "peak-context-pct": { base: 0.45, trend: -0.05, noise: 0.1, clampMin: 0, clampMax: 1 },
  "skill-tool-usage": { base: 0.08, trend: 0.06, noise: 0.04, clampMin: 0, clampMax: 1 },
  "subagent-delegation": { base: 0.12, trend: 0.08, noise: 0.05, clampMin: 0, clampMax: 1 },
  "rubber-stamp-rate": { base: 0.12, trend: -0.04, noise: 0.04, clampMin: 0, clampMax: 1 },
};

function buildAggregateMetrics(prs: PRWithMetrics[], days = 30): AggregateMetrics {
  const totalPRs = prs.length;
  const sessionDataCount = prs.filter(
    (p) => p.metrics && p.metrics.total_tokens !== null,
  ).length;

  const metrics: Record<string, MetricAggregate> = {};
  for (const [slug, cfg] of Object.entries(SPARKLINE_CONFIGS)) {
    // Generate 2x the window so aggregateFromSparkline can compute both
    // current and prior averages. The sparkline returned to the client
    // only covers the current window (last `days` points).
    const fullSparkline = generateSparkline(cfg, days * 2);
    const agg = aggregateFromSparkline(fullSparkline, days);
    agg.sparkline = fullSparkline.slice(-days);
    metrics[slug] = agg;
  }

  return { totalPRs, totalSessions: sessionDataCount, sessionDataCount, metrics };
}

export const MOCK_AGGREGATES: AggregateMetrics = buildAggregateMetrics(MOCK_PRS);

export function getMockAggregatesForDays(days: number): AggregateMetrics {
  return buildAggregateMetrics(MOCK_PRS, days);
}

// Per-repo aggregates (same sparkline shapes, slightly different seeds)
export function getMockAggregatesForRepo(repoId: number, days = 30): AggregateMetrics {
  const repoPrs = MOCK_PRS.filter((p) => p.repo_id === repoId);
  const base = buildAggregateMetrics(repoPrs, days);
  return {
    ...base,
    totalPRs: repoPrs.length,
    sessionDataCount: repoPrs.filter(
      (p) => p.metrics && p.metrics.total_tokens !== null,
    ).length,
  };
}

// ---------------------------------------------------------------------------
// Mock timeline
// ---------------------------------------------------------------------------

export const MOCK_TIMELINE: TimelinePoint[] = MOCK_PRS.filter(
  (p) => p.created_at && p.metrics,
)
  .map((p) => ({
    prNumber: p.number,
    title: p.title ?? `PR #${p.number}`,
    createdAt: p.created_at!,
    postOpenCommits: p.metrics!.post_open_commits,
    ciSuccessRate:
      p.metrics!.ci_success_rate !== null
        ? Math.round(p.metrics!.ci_success_rate * 100)
        : null,
    totalTokens: p.metrics!.total_tokens ?? null,
  }))
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

// ---------------------------------------------------------------------------
// Mock billing
// ---------------------------------------------------------------------------

export const MOCK_BILLING: BillingInfo = {
  plan: {
    name: "pro",
    capabilities: {
      max_repos: 50,
      max_members: 25,
      retention_days: 365,
      export: true,
      sso: false,
    },
  },
  subscription: {
    status: "active",
    current_period_end: daysAgo(-16), // 16 days in the future
    cancel_at_period_end: false,
    quantity: 4,
    seat_price_cents: 1200,
  },
  usage: { members: 4, repos: 3 },
};

// ---------------------------------------------------------------------------
// Mock GitHub installation
// ---------------------------------------------------------------------------

export const MOCK_INSTALLATION: GithubInstallationResponse = {
  installation: {
    id: 1,
    github_installation_id: 48291035,
    account_login: "acme-eng",
    account_type: "Organization",
    repository_selection: "selected" as const,
    status: "active" as const,
    installed_at: daysAgo(45),
    last_synced_at: daysAgo(0),
    repos_count: 3,
    repos: MOCK_REPOS.map((r) => ({
      id: r.id,
      github_owner: r.github_owner,
      github_repo: r.github_repo,
    })),
  },
  user_role: "owner" as const,
};

// ---------------------------------------------------------------------------
// Mock members
// ---------------------------------------------------------------------------

export const MOCK_MEMBERS = {
  members: [
    {
      id: 1,
      role: "owner",
      joined_at: daysAgo(90),
      user: { id: 1, github_username: "austinroos", display_name: "Austin Roos", avatar_url: null },
    },
    {
      id: 2,
      role: "admin",
      joined_at: daysAgo(60),
      user: { id: 2, github_username: "jamiekwon", display_name: "Jamie Kwon", avatar_url: null },
    },
    {
      id: 3,
      role: "member",
      joined_at: daysAgo(30),
      user: { id: 3, github_username: "sammori", display_name: "Sam Mori", avatar_url: null },
    },
    {
      id: 4,
      role: "member",
      joined_at: daysAgo(14),
      user: { id: 4, github_username: "alexchen", display_name: "Alex Chen", avatar_url: null },
    },
  ],
  current_user_role: "owner",
};

// ---------------------------------------------------------------------------
// Mock invites
// ---------------------------------------------------------------------------

export const MOCK_INVITES = [
  { id: 1, github_username: "taylorblake", role: "member", expires_at: daysAgo(-5) },
  { id: 2, github_username: "morganli", role: "admin", expires_at: daysAgo(-3) },
];

// ---------------------------------------------------------------------------
// Mock teams
// ---------------------------------------------------------------------------

const TEAM_MEMBERS_MAP: Record<string, TeamMember[]> = {
  platform: [
    { id: 1, org_membership_id: 1, user: { id: 1, github_username: "austinroos", display_name: "Austin Roos", avatar_url: null } },
    { id: 2, org_membership_id: 2, user: { id: 2, github_username: "jamiekwon", display_name: "Jamie Kwon", avatar_url: null } },
  ],
  frontend: [
    { id: 3, org_membership_id: 3, user: { id: 3, github_username: "sammori", display_name: "Sam Mori", avatar_url: null } },
    { id: 4, org_membership_id: 4, user: { id: 4, github_username: "alexchen", display_name: "Alex Chen", avatar_url: null } },
  ],
  infrastructure: [
    { id: 5, org_membership_id: 1, user: { id: 1, github_username: "austinroos", display_name: "Austin Roos", avatar_url: null } },
  ],
};

export const MOCK_TEAMS: Team[] = [
  { id: 1, slug: "platform", name: "Platform", parent_team_slug: null, member_count: 2, child_team_count: 1 },
  { id: 2, slug: "frontend", name: "Frontend", parent_team_slug: null, member_count: 2, child_team_count: 0 },
  { id: 3, slug: "infrastructure", name: "Infrastructure", parent_team_slug: "platform", member_count: 1, child_team_count: 0 },
];

export function getMockTeamDetail(teamSlug: string): TeamDetail | null {
  const team = MOCK_TEAMS.find((t) => t.slug === teamSlug);
  if (!team) return null;
  return {
    ...team,
    members: TEAM_MEMBERS_MAP[teamSlug] ?? [],
    child_teams: MOCK_TEAMS.filter((t) => t.parent_team_slug === teamSlug),
  };
}

export function getMockTeamPRs(teamSlug: string): PRWithMetrics[] {
  const detail = getMockTeamDetail(teamSlug);
  if (!detail) return [];
  // Collect usernames from this team + child teams (recursive)
  const usernames = new Set<string>();
  function collectMembers(slug: string) {
    const members = TEAM_MEMBERS_MAP[slug] ?? [];
    for (const m of members) usernames.add(m.user.github_username);
    for (const child of MOCK_TEAMS.filter((t) => t.parent_team_slug === slug)) {
      collectMembers(child.slug);
    }
  }
  collectMembers(teamSlug);
  return MOCK_PRS.filter((pr) => pr.author !== null && usernames.has(pr.author));
}

export function getMockTeamMetrics(teamSlug: string, days = 30): AggregateMetrics {
  const prs = getMockTeamPRs(teamSlug);
  return buildAggregateMetrics(prs, days);
}

// ---------------------------------------------------------------------------
// Mock "My" data — PRs and metrics for the current user
// ---------------------------------------------------------------------------

export function getMockMyPRs(): PRWithMetrics[] {
  return MOCK_PRS.filter((pr) => pr.author === MOCK_USER.github_username);
}

export function getMockMyMetrics(days = 30): AggregateMetrics {
  return buildAggregateMetrics(getMockMyPRs(), days);
}

// ---------------------------------------------------------------------------
// Mock sessions (~200 total, with computed metric values)
// ---------------------------------------------------------------------------

const SESSION_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-haiku-4-20250514",
];

function generateSession(idx: number, _repoId: number, author: string): SessionWithMetrics {
  const daysBack = randInt(0, 59);
  const endDate = daysAgo(daysBack);
  const startDate = daysAgo(daysBack); // same day, different time

  const inputTokens = randInt(500, 20000);
  const outputTokens = randInt(200, 8000);
  const cacheCreation = randInt(100, 2000);
  const cacheRead = randInt(200, 8000);
  const totalInput = inputTokens + cacheCreation + cacheRead;
  const messageCount = randInt(2, 20);
  const assistantMessages = randInt(3, 30);
  const sidechainMessages = randInt(0, Math.floor(messageCount * 0.3));
  const filesRead = randInt(2, 20);
  const totalReads = randInt(filesRead, filesRead * 4);

  return {
    id: `session-mock-${idx}`,
    agent_type: ALL_AGENTS[idx % ALL_AGENTS.length],
    started_at: startDate,
    ended_at: endDate,
    branch: BRANCHES[idx % BRANCHES.length],
    pushed_by: author,
    primary_model: SESSION_MODELS[idx % SESSION_MODELS.length],
    metrics: {
      iteration_depth: randInt(1, 14),
      total_tokens: inputTokens + outputTokens,
      cache_hit_rate: totalInput > 0
        ? Math.round((cacheRead / totalInput) * 100) / 100
        : null,
      sidechain_rate: messageCount + assistantMessages > 0
        ? Math.round((sidechainMessages / (messageCount + assistantMessages)) * 100) / 100
        : null,
      re_read_rate: filesRead > 0
        ? Math.round((totalReads / filesRead) * 100) / 100
        : null,
      autonomy_score: messageCount > 0
        ? Math.round((assistantMessages / messageCount) * 10) / 10
        : null,
      peak_context_pct: Math.round(randFloat(0.1, 0.95) * 100) / 100,
      skill_tool_usage: Math.round(randFloat(0.0, 0.3) * 100) / 100,
      subagent_delegation: Math.round(randFloat(0.0, 0.5) * 100) / 100,
    },
  };
}

export const MOCK_SESSIONS: SessionWithMetrics[] = (() => {
  const sessions: SessionWithMetrics[] = [];
  let idx = 0;
  for (const repo of MOCK_REPOS) {
    for (let i = 0; i < 67; i++) {
      const author = MOCK_AUTHORS[idx % MOCK_AUTHORS.length];
      sessions.push(generateSession(idx++, repo.id, author));
    }
  }
  return sessions;
})();

export function getMockMySessions(): SessionWithMetrics[] {
  return MOCK_SESSIONS.filter((s) => s.pushed_by === MOCK_USER.github_username);
}

export function getMockTeamSessions(teamSlug: string): SessionWithMetrics[] {
  const detail = getMockTeamDetail(teamSlug);
  if (!detail) return [];
  const usernames = new Set<string>();
  function collectMembers(slug: string) {
    const members = TEAM_MEMBERS_MAP[slug] ?? [];
    for (const m of members) usernames.add(m.user.github_username);
    for (const child of MOCK_TEAMS.filter((t) => t.parent_team_slug === slug)) {
      collectMembers(child.slug);
    }
  }
  collectMembers(teamSlug);
  return MOCK_SESSIONS.filter((s) => s.pushed_by !== null && usernames.has(s.pushed_by));
}
