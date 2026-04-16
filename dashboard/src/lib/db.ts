// --- API client ---
// The dashboard always fetches from the Rails API (managed mode).
const API_URL = process.env.AX_API_URL;
const API_KEY = process.env.AX_API_KEY || "";

export async function fetchAPI<T>(urlPath: string, init?: { method?: string; revalidate?: number | false }): Promise<T> {
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
  const { cookies } = await import("next/headers");
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

  const res = await fetch(url, { headers, method: init?.method, ...cacheOpts } as RequestInit);
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
  url: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PRMetrics {
  pr_id: number;
  messages_per_pr: number | null;
  iteration_depth: number | null;
  post_open_commits: number | null;
  first_pass_accepted: boolean | null;
  ci_success_rate: number | null;
  diff_churn_lines: number | null;
  has_tests: boolean | null;
  line_revisit_rate: number | null;
  self_correction_rate: number | null;
  context_efficiency: number | null;
  error_recovery_attempts: number | null;
  token_cost_usd: number | null;
  plan_coverage_score: number | null;
  plan_deviation_score: number | null;
  scope_creep_detected: boolean | null;
  cache_hit_rate: number | null;
  sidechain_rate: number | null;
  re_read_rate: number | null;
  autonomy_score: number | null;
  metrics_finalized: boolean;
  finalized_at: string | null;
}

export interface PRWithMetrics extends PR {
  metrics: PRMetrics | null;
  github_owner: string | null;
  github_repo: string | null;
  session_count: number;
}

export interface AggregateMetrics {
  totalPRs: number;
  avgPostOpenCommits: number;
  firstPassAcceptanceRate: number;
  ciSuccessRate: number | null;
  testCoverageRate: number;
  avgMessagesPerPR: number | null;
  avgIterationDepth: number | null;
  avgTokenCost: number | null;
  totalTokenCost: number | null;
  avgSelfCorrectionRate: number | null;
  avgContextEfficiency: number | null;
  avgDiffChurnLines: number | null;
  avgLineRevisitRate: number | null;
  avgErrorRecoveryAttempts: number | null;
  avgPlanCoverage: number | null;
  avgPlanDeviation: number | null;
  scopeCreepRate: number | null;
  planDataCount: number;
  sessionDataCount: number;
  sessionMetricsCount: number;
  avgCacheHitRate: number | null;
  avgSidechainRate: number | null;
  avgReReadRate: number | null;
  avgAutonomyScore: number | null;
}

export interface RepoLevelMetrics {
  unmergedCostUSD: number | null;
  totalCostUSD: number | null;
  unmergedRate: number | null;
}

export interface TimelinePoint {
  prNumber: number;
  title: string;
  createdAt: string;
  postOpenCommits: number | null;
  ciSuccessRate: number | null;
  messagesPerPR: number | null;
  tokenCostUSD: number | null;
  selfCorrectionRate: number | null;
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

export async function getGithubInstallation(orgSlug: string): Promise<GithubInstallationResponse> {
  return fetchAPI<GithubInstallationResponse>(orgApiPath(orgSlug, "/github_installation"), { revalidate: false });
}

export async function requestGithubInstallUrl(orgSlug: string): Promise<{ install_url: string }> {
  return fetchAPI<{ install_url: string }>(orgApiPath(orgSlug, "/github_installation/install_url"), { method: "POST", revalidate: false });
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

export async function getPRWithMetricsAsync(id: number): Promise<PRWithMetrics> {
  return fetchAPI<PRWithMetrics>(`/api/v1/prs/${id}`);
}

export async function listPRsWithMetricsAsync(repoId?: number, orgSlug?: string): Promise<PRWithMetrics[]> {
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

export async function getAggregateMetricsAsync(repoId?: number, orgSlug?: string): Promise<AggregateMetrics> {
  if (repoId) {
    const apiPath = orgSlug
      ? orgApiPath(orgSlug, `/repos/${repoId}/metrics`)
      : `/api/v1/repos/${repoId}/metrics`;
    return fetchAPI<AggregateMetrics>(apiPath);
  }
  if (orgSlug) {
    return fetchAPI<AggregateMetrics>(orgApiPath(orgSlug, "/metrics"));
  }
  const prs = await listPRsWithMetricsAsync(repoId, orgSlug);
  return computeAggregatesFromPRs(prs);
}

export async function getRepoLevelMetricsAsync(repoId?: number, orgSlug?: string): Promise<RepoLevelMetrics> {
  if (repoId) {
    const apiPath = orgSlug
      ? orgApiPath(orgSlug, `/repos/${repoId}/repo-metrics`)
      : `/api/v1/repos/${repoId}/repo-metrics`;
    return fetchAPI<RepoLevelMetrics>(apiPath);
  }
  return { unmergedCostUSD: null, totalCostUSD: null, unmergedRate: null };
}

export function computeAggregatesFromPRs(prs: PRWithMetrics[]): AggregateMetrics {
  const withMetrics = prs.filter((p) => p.metrics);
  const totalPRs = prs.length;

  if (totalPRs === 0) {
    return {
      totalPRs: 0, avgPostOpenCommits: 0, firstPassAcceptanceRate: 0,
      ciSuccessRate: null, testCoverageRate: 0, avgMessagesPerPR: null,
      avgIterationDepth: null, avgTokenCost: null, totalTokenCost: null,
      avgSelfCorrectionRate: null, avgContextEfficiency: null,
      avgDiffChurnLines: null, avgLineRevisitRate: null,
      avgErrorRecoveryAttempts: null, avgPlanCoverage: null,
      avgPlanDeviation: null, scopeCreepRate: null, planDataCount: 0,
      sessionDataCount: 0, sessionMetricsCount: 0,
      avgCacheHitRate: null, avgSidechainRate: null,
      avgReReadRate: null, avgAutonomyScore: null,
    };
  }

  const postOpen = withMetrics.filter((p) => p.metrics!.post_open_commits !== null);
  const avgPostOpenCommits = postOpen.length
    ? postOpen.reduce((s, p) => s + p.metrics!.post_open_commits!, 0) / postOpen.length
    : 0;

  const accepted = withMetrics.filter((p) => p.metrics!.first_pass_accepted !== null);
  const firstPassAcceptanceRate = accepted.length
    ? accepted.filter((p) => p.metrics!.first_pass_accepted === true).length / accepted.length
    : 0;

  const ci = withMetrics.filter((p) => p.metrics!.ci_success_rate !== null);
  const ciSuccessRate = ci.length
    ? ci.reduce((s, p) => s + p.metrics!.ci_success_rate!, 0) / ci.length
    : null;

  const tests = withMetrics.filter((p) => p.metrics!.has_tests !== null);
  const testCoverageRate = tests.length
    ? tests.filter((p) => p.metrics!.has_tests === true).length / tests.length
    : 0;

  const msgs = withMetrics.filter((p) => p.metrics!.messages_per_pr !== null);
  const avgMessagesPerPR = msgs.length
    ? msgs.reduce((s, p) => s + p.metrics!.messages_per_pr!, 0) / msgs.length
    : null;

  const iter = withMetrics.filter((p) => p.metrics!.iteration_depth !== null);
  const avgIterationDepth = iter.length
    ? iter.reduce((s, p) => s + p.metrics!.iteration_depth!, 0) / iter.length
    : null;

  const cost = withMetrics.filter((p) => p.metrics!.token_cost_usd !== null);
  const avgTokenCost = cost.length
    ? cost.reduce((s, p) => s + p.metrics!.token_cost_usd!, 0) / cost.length
    : null;
  const totalTokenCost = cost.length
    ? cost.reduce((s, p) => s + p.metrics!.token_cost_usd!, 0)
    : null;

  const sc = withMetrics.filter((p) => p.metrics!.self_correction_rate !== null);
  const avgSelfCorrectionRate = sc.length
    ? sc.reduce((s, p) => s + p.metrics!.self_correction_rate!, 0) / sc.length
    : null;

  const ce = withMetrics.filter((p) => p.metrics!.context_efficiency !== null);
  const avgContextEfficiency = ce.length
    ? ce.reduce((s, p) => s + p.metrics!.context_efficiency!, 0) / ce.length
    : null;

  const churn = withMetrics.filter((p) => p.metrics!.diff_churn_lines !== null);
  const avgDiffChurnLines = churn.length
    ? churn.reduce((s, p) => s + p.metrics!.diff_churn_lines!, 0) / churn.length
    : null;

  const revisit = withMetrics.filter((p) => p.metrics!.line_revisit_rate !== null);
  const avgLineRevisitRate = revisit.length
    ? revisit.reduce((s, p) => s + p.metrics!.line_revisit_rate!, 0) / revisit.length
    : null;

  const errRec = withMetrics.filter((p) => p.metrics!.error_recovery_attempts !== null);
  const avgErrorRecoveryAttempts = errRec.length
    ? errRec.reduce((s, p) => s + p.metrics!.error_recovery_attempts!, 0) / errRec.length
    : null;

  const planCov = withMetrics.filter((p) => p.metrics!.plan_coverage_score !== null);
  const avgPlanCoverage = planCov.length
    ? planCov.reduce((s, p) => s + p.metrics!.plan_coverage_score!, 0) / planCov.length
    : null;

  const planDev = withMetrics.filter((p) => p.metrics!.plan_deviation_score !== null);
  const avgPlanDeviation = planDev.length
    ? planDev.reduce((s, p) => s + p.metrics!.plan_deviation_score!, 0) / planDev.length
    : null;

  const scopeCreepPRs = withMetrics.filter((p) => p.metrics!.scope_creep_detected !== null);
  const scopeCreepRate = scopeCreepPRs.length
    ? scopeCreepPRs.filter((p) => p.metrics!.scope_creep_detected === true).length / scopeCreepPRs.length
    : null;

  const planDataCount = withMetrics.filter(
    (p) => p.metrics!.plan_coverage_score !== null || p.metrics!.plan_deviation_score !== null
  ).length;

  const cacheHit = withMetrics.filter((p) => p.metrics!.cache_hit_rate !== null);
  const avgCacheHitRate = cacheHit.length
    ? cacheHit.reduce((s, p) => s + p.metrics!.cache_hit_rate!, 0) / cacheHit.length
    : null;

  const sidechain = withMetrics.filter((p) => p.metrics!.sidechain_rate !== null);
  const avgSidechainRate = sidechain.length
    ? sidechain.reduce((s, p) => s + p.metrics!.sidechain_rate!, 0) / sidechain.length
    : null;

  const reRead = withMetrics.filter((p) => p.metrics!.re_read_rate !== null);
  const avgReReadRate = reRead.length
    ? reRead.reduce((s, p) => s + p.metrics!.re_read_rate!, 0) / reRead.length
    : null;

  const autonomy = withMetrics.filter((p) => p.metrics!.autonomy_score !== null);
  const avgAutonomyScore = autonomy.length
    ? autonomy.reduce((s, p) => s + p.metrics!.autonomy_score!, 0) / autonomy.length
    : null;

  return {
    totalPRs, avgPostOpenCommits, firstPassAcceptanceRate,
    ciSuccessRate, testCoverageRate, avgMessagesPerPR,
    avgIterationDepth, avgTokenCost, totalTokenCost,
    avgSelfCorrectionRate, avgContextEfficiency,
    avgDiffChurnLines, avgLineRevisitRate, avgErrorRecoveryAttempts,
    avgPlanCoverage, avgPlanDeviation, scopeCreepRate, planDataCount,
    sessionDataCount: cost.length, sessionMetricsCount: msgs.length,
    avgCacheHitRate, avgSidechainRate, avgReReadRate, avgAutonomyScore,
  };
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

export function getPRSizeColor(size: PRSize): string {
  switch (size) {
    case "XS": return "text-green bg-green-muted";
    case "S": return "text-green bg-green-muted";
    case "M": return "text-amber bg-amber-muted";
    case "L": return "text-red bg-red-muted";
    case "XL": return "text-red bg-red-muted";
  }
}

export async function getTimelineAsync(repoId?: number, orgSlug?: string): Promise<TimelinePoint[]> {
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
      ciSuccessRate: p.metrics!.ci_success_rate !== null ? Math.round(p.metrics!.ci_success_rate * 100) : null,
      messagesPerPR: p.metrics!.messages_per_pr,
      tokenCostUSD: p.metrics!.token_cost_usd !== null ? Math.round(p.metrics!.token_cost_usd * 100) / 100 : null,
      selfCorrectionRate: p.metrics!.self_correction_rate !== null ? Math.round(p.metrics!.self_correction_rate * 100) : null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
