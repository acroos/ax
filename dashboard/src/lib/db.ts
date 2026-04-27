// --- API client ---
// The dashboard always fetches from the Rails API (managed mode).
import { cookies } from "next/headers";
import { isMock, mockFetchAPI } from "./mock";

const API_URL = process.env.AX_API_URL || "http://localhost:3000";
const API_KEY = process.env.AX_API_KEY || "";
const isDev = process.env.NODE_ENV === "development";

export async function fetchAPI<T>(
  urlPath: string,
  init?: { method?: string; revalidate?: number | false },
): Promise<T> {
  if (isMock) return mockFetchAPI<T>(urlPath, init);
  const url = `${API_URL}${urlPath}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Explicitly request persistent connections. Node.js (undici) and Edge
    // runtimes default to keep-alive, but being explicit guards against
    // intermediary proxies that might strip the default.
    "Connection": "keep-alive",
  };
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  // Forward the session token as an explicit header.
  // We do not use a Cookie header because Rails' cookie-jar semantics are
  // unreliable for raw (unsigned) values forwarded from another origin.
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("_ax_session")?.value;
    if (sessionToken) {
      headers["X-Ax-Session"] = sessionToken;
    }
  } catch {
    // Not in a request context (e.g., build time)
  }

  // Default to 60s revalidation for GET requests. Mutations (POST/PUT/DELETE)
  // and explicit revalidate: false bypass the cache entirely.
  const isMutation = init?.method && init.method !== "GET";
  const noCache = isMutation || init?.revalidate === false;
  const cacheOpts = noCache
    ? { cache: "no-store" as const }
    : { next: { revalidate: init?.revalidate ?? 60 } };

  const start = isDev ? performance.now() : 0;
  const res = await fetch(url, {
    headers,
    method: init?.method,
    ...cacheOpts,
  } as RequestInit);
  if (isDev) {
    const ms = (performance.now() - start).toFixed(0);
    const method = init?.method || "GET";
    const cached = noCache ? "" : " (cacheable)";
    console.log(`[fetchAPI] ${method} ${urlPath} → ${res.status} in ${ms}ms${cached}`);
  }
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Too many requests. Please try again shortly.");
    }
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Org-scoped API helper
export function orgApiPath(orgSlug: string, path: string): string {
  return `/api/v1/orgs/${orgSlug}${path}`;
}

// --- Billing ---

export interface BillingInfo {
  plan: {
    name: string;
    capabilities: Record<string, number | boolean | null>;
  };
  subscription: {
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    quantity: number;
    seat_price_cents: number;
  } | null;
  usage: {
    members: number;
    repos: number;
  };
}

export async function getBilling(orgSlug: string): Promise<BillingInfo> {
  return fetchAPI<BillingInfo>(orgApiPath(orgSlug, "/billing"), {
    revalidate: false,
  });
}

// --- Interfaces ---

export interface Repo {
  id: number;
  path: string;
  remote_url: string | null;
  github_owner: string | null;
  github_repo: string | null;
  last_synced_at: string | null;
}

export interface PR {
  id: number;
  repo_id: number;
  number: number;
  title: string | null;
  branch: string | null;
  state: string | null;
  created_at: string | null;
  merged_at: string | null;
  closed_at: string | null;
  url: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PRMetrics {
  pr_id: number;
  post_open_commits: number | null;
  ci_success_rate: number | null;
  line_revisit_rate: number | null;
  // Session-derived fields are computed on-the-fly for PR detail only
  iteration_depth?: number | null;
  total_tokens?: number | null;
  cache_hit_rate?: number | null;
  sidechain_rate?: number | null;
  re_read_rate?: number | null;
  autonomy_score?: number | null;
  // New metrics (Phase 1 — optional, populated in later phases)
  task_cycle_time_hours?: number | null;
  pr_throughput?: number | null;
  peak_context_pct?: number | null;
  skill_tool_usage?: number | null;
  subagent_delegation?: number | null;
  rubber_stamp_rate?: number | null;
  metrics_finalized: boolean;
  finalized_at: string | null;
}

export interface SessionMetrics {
  iteration_depth: number | null;
  total_tokens: number | null;
  cache_hit_rate: number | null;
  sidechain_rate: number | null;
  re_read_rate: number | null;
  autonomy_score: number | null;
  // New metrics (Phase 1 — optional, populated in later phases)
  peak_context_pct?: number | null;
  skill_tool_usage?: number | null;
  subagent_delegation?: number | null;
}

export interface SessionWithMetrics {
  id: string;
  agent_type: AgentType;
  started_at: string | null;
  ended_at: string | null;
  branch: string | null;
  pushed_by: string | null;
  primary_model: string | null;
  metrics: SessionMetrics;
}

export interface PaginatedSessions {
  data: SessionWithMetrics[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    total: number;
  };
}

export type AgentType = "claude_code" | "copilot_cli";

export interface PRWithMetrics extends PR {
  metrics: PRMetrics | null;
  author: string | null;
  github_owner: string | null;
  github_repo: string | null;
  session_count: number;
}

export interface PaginatedPRs {
  data: PRWithMetrics[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    total: number;
  };
}

export interface SparklinePoint {
  t: string;
  v: number | null;
}

export interface MetricAggregate {
  current: number | null;
  prior: number | null;
  sparkline: SparklinePoint[];
}

export interface AggregateMetrics {
  totalPRs: number;
  totalSessions: number;
  sessionDataCount: number;
  metrics: Record<string, MetricAggregate>;
}

// --- Metric Detail (server-computed) ---

export interface MetricDetailTrendPoint {
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface MetricDetailDistBucket {
  label: string;
  count: number;
  pct: number;
}

export interface NotablePR {
  id: number;
  number: number;
  title: string;
  value: number;
  state: string;
}

export interface NotableSession {
  id: string;
  label: string;
  value: number;
}

export type NotableItem = NotablePR | NotableSession;

export function isNotablePR(item: NotableItem): item is NotablePR {
  return "number" in item;
}

export interface MetricDetailResponse {
  metric: string;
  source: "pr" | "session";
  range: string;
  count: number;
  total_count: number;
  stats: { avg: number; p10: number; p50: number; p90: number } | null;
  prior_stats: { avg: number; p10: number; p50: number; p90: number } | null;
  trend: MetricDetailTrendPoint[];
  distribution: MetricDetailDistBucket[];
  notable_highest: NotableItem[];
  notable_lowest: NotableItem[];
}

export interface TimelinePoint {
  prNumber: number;
  title: string;
  createdAt: string;
  postOpenCommits: number | null;
  ciSuccessRate: number | null;
  totalTokens: number | null;
}

// --- GitHub Installation ---

export type GithubInstallationStatus = "active" | "suspended" | "deleted";
export type OrgRole = "owner" | "admin" | "member";

export interface GithubInstallationRepo {
  id: number;
  github_owner: string | null;
  github_repo: string | null;
}

export interface GithubInstallation {
  id: number;
  github_installation_id: number;
  account_login: string;
  account_type: string;
  repository_selection: "all" | "selected";
  status: GithubInstallationStatus;
  installed_at: string | null;
  last_synced_at: string | null;
  repos_count: number;
  repos: GithubInstallationRepo[];
}

export interface GithubInstallationResponse {
  installation: GithubInstallation | null;
  user_role: OrgRole;
}

export async function getGithubInstallation(
  orgSlug: string,
  opts?: { revalidate?: number | false },
): Promise<GithubInstallationResponse> {
  return fetchAPI<GithubInstallationResponse>(
    orgApiPath(orgSlug, "/github_installation"),
    { revalidate: opts?.revalidate ?? 60 },
  );
}

export async function requestGithubInstallUrl(
  orgSlug: string,
): Promise<{ install_url: string }> {
  return fetchAPI<{ install_url: string }>(
    orgApiPath(orgSlug, "/github_installation/install_url"),
    { method: "POST", revalidate: false },
  );
}

// --- Teams ---

export interface Team {
  id: number;
  slug: string;
  name: string;
  parent_team_slug: string | null;
  member_count: number;
  child_team_count: number;
}

export interface TeamMember {
  id: number;
  org_membership_id: number;
  user: {
    id: number;
    github_username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface TeamDetail extends Team {
  members: TeamMember[];
  child_teams: Team[];
}

export async function listTeamsAsync(orgSlug: string): Promise<Team[]> {
  return fetchAPI<Team[]>(orgApiPath(orgSlug, "/teams"));
}

export async function getTeamAsync(
  orgSlug: string,
  teamSlug: string,
): Promise<TeamDetail> {
  return fetchAPI<TeamDetail>(orgApiPath(orgSlug, `/teams/${teamSlug}`));
}

export async function getTeamMetricsAsync(
  orgSlug: string,
  teamSlug: string,
  range?: string,
  agentType?: AgentType,
): Promise<AggregateMetrics> {
  const rangeParam = buildQuery({ range, agent_type: agentType });
  return fetchAPI<AggregateMetrics>(
    orgApiPath(orgSlug, `/teams/${teamSlug}/metrics`) + rangeParam,
  );
}

export async function listTeamPRsAsync(
  orgSlug: string,
  teamSlug: string,
  pagination?: { cursor?: string; per_page?: number },
): Promise<PaginatedPRs> {
  const qs = buildPaginationQuery(pagination);
  return fetchAPI<PaginatedPRs>(
    orgApiPath(orgSlug, `/teams/${teamSlug}/prs`) + qs,
  );
}

export async function listTeamMembersAsync(
  orgSlug: string,
  teamSlug: string,
): Promise<TeamMember[]> {
  return fetchAPI<TeamMember[]>(
    orgApiPath(orgSlug, `/teams/${teamSlug}/members`),
  );
}

// --- Current user (me) ---

// --- Metric Detail functions ---

export async function getMetricDetailAsync(
  orgSlug: string,
  metricSlug: string,
  range?: string,
  repoId?: number,
  agentType?: AgentType,
): Promise<MetricDetailResponse> {
  const qs = buildQuery({ range, agent_type: agentType });
  if (repoId) {
    return fetchAPI<MetricDetailResponse>(
      orgApiPath(orgSlug, `/repos/${repoId}/metrics/${metricSlug}`) + qs,
    );
  }
  return fetchAPI<MetricDetailResponse>(
    orgApiPath(orgSlug, `/metrics/${metricSlug}`) + qs,
  );
}

export async function getMyMetricDetailAsync(
  orgSlug: string,
  metricSlug: string,
  range?: string,
  agentType?: AgentType,
): Promise<MetricDetailResponse> {
  const rangeParam = buildQuery({ range, agent_type: agentType });
  return fetchAPI<MetricDetailResponse>(
    orgApiPath(orgSlug, `/me/metrics/${metricSlug}`) + rangeParam,
  );
}

export async function getTeamMetricDetailAsync(
  orgSlug: string,
  teamSlug: string,
  metricSlug: string,
  range?: string,
  agentType?: AgentType,
): Promise<MetricDetailResponse> {
  const rangeParam = buildQuery({ range, agent_type: agentType });
  return fetchAPI<MetricDetailResponse>(
    orgApiPath(orgSlug, `/teams/${teamSlug}/metrics/${metricSlug}`) + rangeParam,
  );
}

export async function getMyMetricsAsync(
  orgSlug: string,
  range?: string,
  agentType?: AgentType,
): Promise<AggregateMetrics> {
  const rangeParam = buildQuery({ range, agent_type: agentType });
  return fetchAPI<AggregateMetrics>(
    orgApiPath(orgSlug, "/me/metrics") + rangeParam,
  );
}

export async function listMyPRsAsync(
  orgSlug: string,
  pagination?: { cursor?: string; per_page?: number },
): Promise<PaginatedPRs> {
  const qs = buildPaginationQuery(pagination);
  return fetchAPI<PaginatedPRs>(orgApiPath(orgSlug, "/me/prs") + qs);
}

// --- Session list functions ---

export async function listSessionsAsync(
  repoId?: number,
  orgSlug?: string,
  pagination?: { per_page?: number },
  agentType?: AgentType,
): Promise<PaginatedSessions> {
  const qs = buildQuery({ per_page: pagination?.per_page, agent_type: agentType });
  if (repoId && orgSlug) {
    return fetchAPI<PaginatedSessions>(
      orgApiPath(orgSlug, `/repos/${repoId}/sessions`) + qs,
    );
  }
  if (orgSlug) {
    return fetchAPI<PaginatedSessions>(
      orgApiPath(orgSlug, "/sessions") + qs,
    );
  }
  return { data: [], pagination: { next_cursor: null, has_more: false, total: 0 } };
}

export async function listMySessionsAsync(
  orgSlug: string,
  pagination?: { per_page?: number },
  agentType?: AgentType,
): Promise<PaginatedSessions> {
  const qs = buildQuery({ per_page: pagination?.per_page, agent_type: agentType });
  return fetchAPI<PaginatedSessions>(
    orgApiPath(orgSlug, "/me/sessions") + qs,
  );
}

export async function listTeamSessionsAsync(
  orgSlug: string,
  teamSlug: string,
  pagination?: { per_page?: number },
  agentType?: AgentType,
): Promise<PaginatedSessions> {
  const qs = buildQuery({ per_page: pagination?.per_page, agent_type: agentType });
  return fetchAPI<PaginatedSessions>(
    orgApiPath(orgSlug, `/teams/${teamSlug}/sessions`) + qs,
  );
}

// --- Pagination helper ---

function buildPaginationQuery(
  pagination?: { cursor?: string; per_page?: number },
): string {
  if (!pagination) return "";
  const parts: string[] = [];
  if (pagination.cursor) parts.push(`cursor=${encodeURIComponent(pagination.cursor)}`);
  if (pagination.per_page) parts.push(`per_page=${pagination.per_page}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params).flatMap(([key, value]) =>
    value === undefined || value === "" ? [] : [`${key}=${encodeURIComponent(String(value))}`],
  );
  return parts.length ? `?${parts.join("&")}` : "";
}

// --- Data functions ---

export async function listReposAsync(orgSlug?: string): Promise<Repo[]> {
  if (orgSlug) {
    return fetchAPI<Repo[]>(orgApiPath(orgSlug, "/repos"));
  }
  return fetchAPI<Repo[]>("/api/v1/repos");
}

export async function getRepoAsync(id: number): Promise<Repo | undefined> {
  const repos = await fetchAPI<Repo[]>("/api/v1/repos");
  return repos.find((r) => r.id === id);
}

export async function getPRWithMetricsAsync(
  id: number,
): Promise<PRWithMetrics> {
  return fetchAPI<PRWithMetrics>(`/api/v1/prs/${id}`);
}

export async function listPRsWithMetricsAsync(
  repoId?: number,
  orgSlug?: string,
  pagination?: { cursor?: string; per_page?: number },
): Promise<PaginatedPRs> {
  const qs = buildPaginationQuery(pagination);
  if (repoId) {
    const apiPath = orgSlug
      ? orgApiPath(orgSlug, `/repos/${repoId}/prs`)
      : `/api/v1/repos/${repoId}/prs`;
    return fetchAPI<PaginatedPRs>(apiPath + qs);
  }
  if (orgSlug) {
    return fetchAPI<PaginatedPRs>(orgApiPath(orgSlug, "/prs") + qs);
  }
  return { data: [], pagination: { next_cursor: null, has_more: false, total: 0 } };
}

export async function getAggregateMetricsAsync(
  repoId?: number,
  orgSlug?: string,
  range?: string,
  agentType?: AgentType,
): Promise<AggregateMetrics> {
  const rangeParam = buildQuery({ range, agent_type: agentType });
  if (repoId) {
    const apiPath = orgSlug
      ? orgApiPath(orgSlug, `/repos/${repoId}/metrics`) + rangeParam
      : `/api/v1/repos/${repoId}/metrics` + rangeParam;
    return fetchAPI<AggregateMetrics>(apiPath);
  }
  if (orgSlug) {
    return fetchAPI<AggregateMetrics>(orgApiPath(orgSlug, "/metrics") + rangeParam);
  }
  const result = await listPRsWithMetricsAsync(repoId, orgSlug);
  return computeAggregatesFromPRs(result.data);
}

// Only PR-derived metrics are available on the PR list response.
// Session-derived metrics come from the sessions API.
const METRIC_FIELDS: Array<{ slug: string; field: keyof PRMetrics }> = [
  { slug: "post-open-commits", field: "post_open_commits" },
  { slug: "ci-success-rate", field: "ci_success_rate" },
  { slug: "line-revisit-rate", field: "line_revisit_rate" },
];

export function computeAggregatesFromPRs(prs: PRWithMetrics[]): AggregateMetrics {
  const withMetrics = prs.filter((p) => p.metrics);
  const totalPRs = prs.length;
  const sessionDataCount = withMetrics.filter(
    (p) => p.metrics!.total_tokens !== null
  ).length;

  const metrics: Record<string, MetricAggregate> = {};
  for (const { slug, field } of METRIC_FIELDS) {
    const vals = withMetrics
      .map((p) => p.metrics![field] as number | null)
      .filter((v): v is number => v !== null);
    metrics[slug] = {
      current: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      prior: null,
      sparkline: [],
    };
  }

  return { totalPRs, totalSessions: sessionDataCount, sessionDataCount, metrics };
}

// --- Utility functions (re-exported from pr-utils for convenience) ---

export { getPRSize, type PRSize } from "./pr-utils";

export async function getTimelineAsync(
  repoId?: number,
  orgSlug?: string,
): Promise<TimelinePoint[]> {
  if (repoId) {
    const apiPath = orgSlug
      ? orgApiPath(orgSlug, `/repos/${repoId}/timeline`)
      : `/api/v1/repos/${repoId}/timeline`;
    return fetchAPI<TimelinePoint[]>(apiPath);
  }
  const result = await listPRsWithMetricsAsync(repoId, orgSlug);
  return buildTimeline(result.data);
}

function buildTimeline(prs: PRWithMetrics[]): TimelinePoint[] {
  return prs
    .filter((p) => p.created_at && p.metrics)
    .map((p) => ({
      prNumber: p.number,
      title: p.title ?? `PR #${p.number}`,
      createdAt: p.created_at!,
      postOpenCommits: p.metrics!.post_open_commits,
      ciSuccessRate:
        p.metrics!.ci_success_rate !== null
          ? Math.round(p.metrics!.ci_success_rate * 100)
          : null,
      totalTokens:
        p.metrics!.total_tokens != null
          ? Math.round(p.metrics!.total_tokens)
          : null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
