import Database from "better-sqlite3";
import path from "path";
import os from "os";

// --- Mode detection ---
// When AX_API_URL is set, the dashboard fetches from the Go server API.
// Otherwise, it reads from the local SQLite database directly.
const API_URL = process.env.AX_API_URL;
const API_KEY = process.env.AX_API_KEY || "";

function isAPIMode(): boolean {
  return !!API_URL;
}

async function fetchAPI<T>(urlPath: string): Promise<T> {
  const url = `${API_URL}${urlPath}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- SQLite (local mode) ---
const DB_PATH =
  process.env.AX_DB_PATH || path.join(os.homedir(), ".ax", "ax.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma("journal_mode = WAL");
  }
  return db;
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
  author: string | null;
}

export interface PRMetrics {
  pr_id: number;
  messages_per_pr: number | null;
  iteration_depth: number | null;
  post_open_commits: number | null;
  first_pass_accepted: number | null;
  ci_success_rate: number | null;
  diff_churn_lines: number | null;
  has_tests: number | null;
  line_revisit_rate: number | null;
  self_correction_rate: number | null;
  context_efficiency: number | null;
  error_recovery_attempts: number | null;
  token_cost_usd: number | null;
  plan_coverage_score: number | null;
  plan_deviation_score: number | null;
  scope_creep_detected: number | null;
  metrics_finalized: number;
  finalized_at: string | null;
}

export interface PRWithMetrics extends PR {
  metrics: PRMetrics | null;
  github_owner: string | null;
  github_repo: string | null;
}

export interface WatchStatus {
  repo_id: number;
  poll_interval_seconds: number;
  last_polled_at: string | null;
  enabled: number;
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

// --- Data functions (sync for local, async for API) ---

// listRepos returns all tracked repositories.
// Sync version for local mode (used by Sidebar which is a sync server component).
export function listRepos(): Repo[] {
  if (isAPIMode()) {
    // Sidebar needs sync access — return empty in API mode
    // and use listReposAsync() in async contexts
    return [];
  }
  return getDb().prepare("SELECT * FROM repos ORDER BY path").all() as Repo[];
}

export async function listReposAsync(): Promise<Repo[]> {
  if (isAPIMode()) {
    return fetchAPI<Repo[]>("/api/v1/repos");
  }
  return getDb().prepare("SELECT * FROM repos ORDER BY path").all() as Repo[];
}

export function getRepo(id: number): Repo | undefined {
  return getDb().prepare("SELECT * FROM repos WHERE id = ?").get(id) as
    | Repo
    | undefined;
}

export async function getRepoAsync(id: number): Promise<Repo | undefined> {
  if (isAPIMode()) {
    const repos = await fetchAPI<Repo[]>("/api/v1/repos");
    return repos.find((r) => r.id === id);
  }
  return getRepo(id);
}

// listPRsWithMetrics returns finalized PRs with their computed metrics.
export function listPRsWithMetrics(repoId?: number): PRWithMetrics[] {
  const baseQuery = `SELECT p.*, p.author, pm.messages_per_pr, pm.iteration_depth, pm.post_open_commits,
         pm.first_pass_accepted, pm.ci_success_rate, pm.diff_churn_lines,
         pm.has_tests, pm.line_revisit_rate, pm.self_correction_rate,
         pm.context_efficiency, pm.error_recovery_attempts, pm.token_cost_usd,
         pm.plan_coverage_score, pm.plan_deviation_score, pm.scope_creep_detected,
         pm.metrics_finalized, pm.finalized_at,
         r.github_owner, r.github_repo
       FROM prs p
       INNER JOIN pr_metrics pm ON p.id = pm.pr_id
       JOIN repos r ON p.repo_id = r.id
       WHERE pm.metrics_finalized = 1`;

  const query = repoId
    ? `${baseQuery} AND p.repo_id = ? ORDER BY p.number DESC`
    : `${baseQuery} ORDER BY p.created_at DESC`;

  const rows = repoId
    ? getDb().prepare(query).all(repoId)
    : getDb().prepare(query).all();

  return mapPRRows(rows as (PR & PRMetrics & { github_owner: string; github_repo: string })[]);
}

export async function listPRsWithMetricsAsync(repoId?: number): Promise<PRWithMetrics[]> {
  if (isAPIMode()) {
    const path = repoId ? `/api/v1/repos/${repoId}/prs` : `/api/v1/repos/0/prs`;
    const data = await fetchAPI<PRWithMetrics[]>(path);
    return data;
  }
  return listPRsWithMetrics(repoId);
}

function mapPRRows(rows: (PR & PRMetrics & { github_owner: string; github_repo: string })[]): PRWithMetrics[] {
  return rows.map((row) => ({
    id: row.id,
    repo_id: row.repo_id,
    number: row.number,
    title: row.title,
    branch: row.branch,
    state: row.state,
    created_at: row.created_at,
    merged_at: row.merged_at,
    url: row.url,
    additions: row.additions,
    deletions: row.deletions,
    changed_files: row.changed_files,
    author: (row as unknown as Record<string, unknown>).author as string | null ?? null,
    github_owner: row.github_owner,
    github_repo: row.github_repo,
    metrics: {
      pr_id: row.id,
      messages_per_pr: row.messages_per_pr,
      iteration_depth: row.iteration_depth,
      post_open_commits: row.post_open_commits,
      first_pass_accepted: row.first_pass_accepted,
      ci_success_rate: row.ci_success_rate,
      diff_churn_lines: row.diff_churn_lines,
      has_tests: row.has_tests,
      line_revisit_rate: row.line_revisit_rate,
      self_correction_rate: row.self_correction_rate,
      context_efficiency: row.context_efficiency,
      error_recovery_attempts: row.error_recovery_attempts,
      token_cost_usd: row.token_cost_usd,
      plan_coverage_score: row.plan_coverage_score,
      plan_deviation_score: row.plan_deviation_score,
      scope_creep_detected: row.scope_creep_detected,
      metrics_finalized: row.metrics_finalized,
      finalized_at: row.finalized_at,
    },
  }));
}

export function listWatchStatuses(): WatchStatus[] {
  if (isAPIMode()) {
    return [];
  }
  return getDb()
    .prepare("SELECT * FROM watched_repos WHERE enabled = 1")
    .all() as WatchStatus[];
}

export async function listWatchStatusesAsync(): Promise<WatchStatus[]> {
  if (isAPIMode()) {
    return fetchAPI<WatchStatus[]>("/api/v1/watch-status");
  }
  return listWatchStatuses();
}

// getAggregateMetrics computes aggregate metrics across finalized PRs.
export function getAggregateMetrics(repoId?: number): AggregateMetrics {
  const prs = listPRsWithMetrics(repoId);
  return computeAggregates(prs);
}

export async function getAggregateMetricsAsync(repoId?: number): Promise<AggregateMetrics> {
  if (isAPIMode() && repoId) {
    return fetchAPI<AggregateMetrics>(`/api/v1/repos/${repoId}/metrics`);
  }
  const prs = await listPRsWithMetricsAsync(repoId);
  return computeAggregates(prs);
}

function computeAggregates(prs: PRWithMetrics[]): AggregateMetrics {
  const withMetrics = prs.filter((p) => p.metrics);
  const totalPRs = prs.length;

  if (totalPRs === 0) {
    return {
      totalPRs: 0, avgPostOpenCommits: 0, firstPassAcceptanceRate: 0,
      ciSuccessRate: null, testCoverageRate: 0, avgMessagesPerPR: null,
      avgIterationDepth: null, avgTokenCost: null, totalTokenCost: null,
      avgSelfCorrectionRate: null, avgContextEfficiency: null,
    };
  }

  const postOpen = withMetrics.filter((p) => p.metrics!.post_open_commits !== null);
  const avgPostOpenCommits = postOpen.length
    ? postOpen.reduce((s, p) => s + p.metrics!.post_open_commits!, 0) / postOpen.length
    : 0;

  const accepted = withMetrics.filter((p) => p.metrics!.first_pass_accepted !== null);
  const firstPassAcceptanceRate = accepted.length
    ? accepted.filter((p) => p.metrics!.first_pass_accepted === 1).length / accepted.length
    : 0;

  const ci = withMetrics.filter((p) => p.metrics!.ci_success_rate !== null);
  const ciSuccessRate = ci.length
    ? ci.reduce((s, p) => s + p.metrics!.ci_success_rate!, 0) / ci.length
    : null;

  const tests = withMetrics.filter((p) => p.metrics!.has_tests !== null);
  const testCoverageRate = tests.length
    ? tests.filter((p) => p.metrics!.has_tests === 1).length / tests.length
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

  return {
    totalPRs, avgPostOpenCommits, firstPassAcceptanceRate,
    ciSuccessRate, testCoverageRate, avgMessagesPerPR,
    avgIterationDepth, avgTokenCost, totalTokenCost,
    avgSelfCorrectionRate, avgContextEfficiency,
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

// getTimeline returns time-series data for trend charts.
export function getTimeline(repoId?: number): TimelinePoint[] {
  const prs = listPRsWithMetrics(repoId);
  return buildTimeline(prs);
}

export async function getTimelineAsync(repoId?: number): Promise<TimelinePoint[]> {
  if (isAPIMode() && repoId) {
    return fetchAPI<TimelinePoint[]>(`/api/v1/repos/${repoId}/timeline`);
  }
  const prs = await listPRsWithMetricsAsync(repoId);
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

// --- Comparison and filtering functions ---

export interface FilterOpts {
  repoId?: number;
  author?: string;
  since?: string;
  until?: string;
}

export interface DeveloperMetrics {
  author: string;
  prCount: number;
  metrics: AggregateMetrics;
}

function filterPRs(prs: PRWithMetrics[], opts: FilterOpts): PRWithMetrics[] {
  return prs.filter((p) => {
    if (opts.author && p.author !== opts.author) return false;
    if (opts.since && p.created_at && p.created_at < opts.since) return false;
    if (opts.until && p.created_at && p.created_at > opts.until) return false;
    return true;
  });
}

// listDevelopers returns unique PR author logins for a repo.
export function listDevelopers(repoId?: number): string[] {
  const prs = listPRsWithMetrics(repoId);
  const authors = new Set<string>();
  for (const pr of prs) {
    if (pr.author) authors.add(pr.author);
  }
  return Array.from(authors).sort();
}

export async function listDevelopersAsync(repoId?: number): Promise<string[]> {
  const prs = await listPRsWithMetricsAsync(repoId);
  const authors = new Set<string>();
  for (const pr of prs) {
    if (pr.author) authors.add(pr.author);
  }
  return Array.from(authors).sort();
}

// getFilteredMetrics returns aggregate metrics with filtering.
export async function getFilteredMetricsAsync(opts: FilterOpts): Promise<AggregateMetrics> {
  const allPRs = await listPRsWithMetricsAsync(opts.repoId);
  const filtered = filterPRs(allPRs, opts);
  return computeAggregates(filtered);
}

// getDeveloperComparison returns per-developer aggregate metrics.
export async function getDeveloperComparisonAsync(opts: FilterOpts): Promise<DeveloperMetrics[]> {
  const allPRs = await listPRsWithMetricsAsync(opts.repoId);
  const filtered = filterPRs(allPRs, { since: opts.since, until: opts.until });

  // Group by author
  const byAuthor = new Map<string, PRWithMetrics[]>();
  for (const pr of filtered) {
    const author = pr.author || "unknown";
    if (!byAuthor.has(author)) byAuthor.set(author, []);
    byAuthor.get(author)!.push(pr);
  }

  const result: DeveloperMetrics[] = [];
  for (const [author, prs] of byAuthor) {
    result.push({
      author,
      prCount: prs.length,
      metrics: computeAggregates(prs),
    });
  }

  return result.sort((a, b) => b.prCount - a.prCount);
}

// getPercentile computes where a value falls relative to all values.
export function getPercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v < value).length;
  return Math.round((rank / sorted.length) * 100);
}

// getFilteredTimeline returns timeline data with filtering.
export async function getFilteredTimelineAsync(opts: FilterOpts): Promise<TimelinePoint[]> {
  const allPRs = await listPRsWithMetricsAsync(opts.repoId);
  const filtered = filterPRs(allPRs, opts);
  return buildTimeline(filtered);
}
