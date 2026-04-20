// --- API client ---
// The dashboard always fetches from the Rails API (managed mode).
import { cookies } from "next/headers";
import { isMock, mockFetchAPI } from "./mock";

const API_URL = process.env.AX_API_URL;
const API_KEY = process.env.AX_API_KEY || "";

export async function fetchAPI<T>(
  urlPath: string,
  init?: { method?: string; revalidate?: number | false },
): Promise<T> {
  if (isMock) return mockFetchAPI<T>(urlPath, init);
  const url = `${API_URL}${urlPath}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
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

  const res = await fetch(url, {
    headers,
    method: init?.method,
    ...cacheOpts,
  } as RequestInit);
  if (!res.ok) {
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
  iteration_depth: number | null;
  post_open_commits: number | null;
  ci_success_rate: number | null;
  line_revisit_rate: number | null;
  review_cycle_time_minutes: number | null;
  first_review_at: string | null;
  token_cost_usd: number | null;
  cache_hit_rate: number | null;
  sidechain_rate: number | null;
  re_read_rate: number | null;
  autonomy_score: number | null;
  metrics_finalized: boolean;
  finalized_at: string | null;
}

export interface PRWithMetrics extends PR {
  metrics: PRMetrics | null;
  author: string | null;
  github_owner: string | null;
  github_repo: string | null;
  session_count: number;
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
  sessionDataCount: number;
  metrics: Record<string, MetricAggregate>;
}

export interface TimelinePoint {
  prNumber: number;
  title: string;
  createdAt: string;
  postOpenCommits: number | null;
  ciSuccessRate: number | null;
  tokenCostUSD: number | null;
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
): Promise<AggregateMetrics> {
  const rangeParam = range ? `?range=${range}` : "";
  return fetchAPI<AggregateMetrics>(
    orgApiPath(orgSlug, `/teams/${teamSlug}/metrics`) + rangeParam,
  );
}

export async function listTeamPRsAsync(
  orgSlug: string,
  teamSlug: string,
): Promise<PRWithMetrics[]> {
  return fetchAPI<PRWithMetrics[]>(
    orgApiPath(orgSlug, `/teams/${teamSlug}/prs`),
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

export async function getMyMetricsAsync(
  orgSlug: string,
  range?: string,
): Promise<AggregateMetrics> {
  const rangeParam = range ? `?range=${range}` : "";
  return fetchAPI<AggregateMetrics>(
    orgApiPath(orgSlug, "/me/metrics") + rangeParam,
  );
}

export async function listMyPRsAsync(
  orgSlug: string,
): Promise<PRWithMetrics[]> {
  return fetchAPI<PRWithMetrics[]>(orgApiPath(orgSlug, "/me/prs"));
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
): Promise<PRWithMetrics[]> {
  if (repoId) {
    const apiPath = orgSlug
      ? orgApiPath(orgSlug, `/repos/${repoId}/prs`)
      : `/api/v1/repos/${repoId}/prs`;
    return fetchAPI<PRWithMetrics[]>(apiPath);
  }
  if (orgSlug) {
    return fetchAPI<PRWithMetrics[]>(orgApiPath(orgSlug, "/prs"));
  }
  return [];
}

export async function getAggregateMetricsAsync(
  repoId?: number,
  orgSlug?: string,
  range?: string,
): Promise<AggregateMetrics> {
  const rangeParam = range ? `?range=${range}` : "";
  if (repoId) {
    const apiPath = orgSlug
      ? orgApiPath(orgSlug, `/repos/${repoId}/metrics`) + rangeParam
      : `/api/v1/repos/${repoId}/metrics` + rangeParam;
    return fetchAPI<AggregateMetrics>(apiPath);
  }
  if (orgSlug) {
    return fetchAPI<AggregateMetrics>(orgApiPath(orgSlug, "/metrics") + rangeParam);
  }
  const prs = await listPRsWithMetricsAsync(repoId, orgSlug);
  return computeAggregatesFromPRs(prs);
}

const METRIC_FIELDS: Array<{ slug: string; field: keyof PRMetrics }> = [
  { slug: "post-open-commits", field: "post_open_commits" },
  { slug: "ci-success-rate", field: "ci_success_rate" },
  { slug: "line-revisit-rate", field: "line_revisit_rate" },
  { slug: "iteration-depth", field: "iteration_depth" },
  { slug: "token-cost-per-pr", field: "token_cost_usd" },
  { slug: "cache-hit-rate", field: "cache_hit_rate" },
  { slug: "sidechain-rate", field: "sidechain_rate" },
  { slug: "re-read-rate", field: "re_read_rate" },
  { slug: "autonomy-score", field: "autonomy_score" },
  { slug: "review-cycle-time", field: "review_cycle_time_minutes" },
];

export function computeAggregatesFromPRs(prs: PRWithMetrics[]): AggregateMetrics {
  const withMetrics = prs.filter((p) => p.metrics);
  const totalPRs = prs.length;
  const sessionDataCount = withMetrics.filter(
    (p) => p.metrics!.token_cost_usd !== null
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

  return { totalPRs, sessionDataCount, metrics };
}

// --- Utility functions (no DB/API needed) ---

export type PRSize = "XS" | "S" | "M" | "L" | "XL";

export function getPRSize(additions: number, deletions: number): PRSize {
  const total = additions + deletions;
  if (total <= 10) return "XS";
  if (total <= 100) return "S";
  if (total <= 500) return "M";
  if (total <= 1000) return "L";
  return "XL";
}

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
  const prs = await listPRsWithMetricsAsync(repoId, orgSlug);
  return buildTimeline(prs);
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
      tokenCostUSD:
        p.metrics!.token_cost_usd !== null
          ? Math.round(p.metrics!.token_cost_usd * 100) / 100
          : null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
