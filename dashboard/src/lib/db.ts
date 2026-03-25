import Database from "better-sqlite3";
import path from "path";
import os from "os";

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
  first_pass_accepted: number | null;
  ci_success_rate: number | null;
  diff_churn_lines: number | null;
  has_tests: number | null;
  line_revisit_rate: number | null;
  self_correction_rate: number | null;
  context_efficiency: number | null;
  error_recovery_attempts: number | null;
  token_cost_usd: number | null;
}

export interface PRWithMetrics extends PR {
  metrics: PRMetrics | null;
  github_owner: string | null;
  github_repo: string | null;
}

export function listRepos(): Repo[] {
  return getDb().prepare("SELECT * FROM repos ORDER BY path").all() as Repo[];
}

export function getRepo(id: number): Repo | undefined {
  return getDb().prepare("SELECT * FROM repos WHERE id = ?").get(id) as
    | Repo
    | undefined;
}

export function listPRsWithMetrics(repoId?: number): PRWithMetrics[] {
  const query = repoId
    ? `SELECT p.*, pm.messages_per_pr, pm.iteration_depth, pm.post_open_commits,
         pm.first_pass_accepted, pm.ci_success_rate, pm.diff_churn_lines,
         pm.has_tests, pm.line_revisit_rate, pm.self_correction_rate,
         pm.context_efficiency, pm.error_recovery_attempts, pm.token_cost_usd,
         r.github_owner, r.github_repo
       FROM prs p
       LEFT JOIN pr_metrics pm ON p.id = pm.pr_id
       JOIN repos r ON p.repo_id = r.id
       WHERE p.repo_id = ?
       ORDER BY p.number DESC`
    : `SELECT p.*, pm.messages_per_pr, pm.iteration_depth, pm.post_open_commits,
         pm.first_pass_accepted, pm.ci_success_rate, pm.diff_churn_lines,
         pm.has_tests, pm.line_revisit_rate, pm.self_correction_rate,
         pm.context_efficiency, pm.error_recovery_attempts, pm.token_cost_usd,
         r.github_owner, r.github_repo
       FROM prs p
       LEFT JOIN pr_metrics pm ON p.id = pm.pr_id
       JOIN repos r ON p.repo_id = r.id
       ORDER BY p.created_at DESC`;

  const rows = repoId
    ? getDb().prepare(query).all(repoId)
    : getDb().prepare(query).all();

  return (rows as (PR & PRMetrics & { github_owner: string; github_repo: string })[]).map(
    (row) => ({
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
      github_owner: row.github_owner,
      github_repo: row.github_repo,
      metrics: row.post_open_commits !== null
        ? {
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
          }
        : null,
    })
  );
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

export function getAggregateMetrics(repoId?: number): AggregateMetrics {
  const prs = listPRsWithMetrics(repoId);
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
