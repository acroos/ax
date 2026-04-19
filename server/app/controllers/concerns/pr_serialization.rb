module PrSerialization
  extend ActiveSupport::Concern

  private

  def pr_with_metrics(pr)
    m = pr.pr_metrics
    {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      branch: pr.branch,
      state: pr.state,
      created_at: pr.created_at_source,
      merged_at: pr.merged_at,
      closed_at: pr.closed_at,
      url: pr.url,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      author: pr.author,
      github_owner: pr.repo.github_owner,
      github_repo: pr.repo.github_repo,
      session_count: pr.session_prs.size,
      metrics: m ? {
        pr_number: pr.number,
        iteration_depth: m.iteration_depth,
        post_open_commits: m.post_open_commits,
        ci_success_rate: m.ci_success_rate,
        line_revisit_rate: m.line_revisit_rate,
        token_cost_usd: m.token_cost_usd,
        cache_hit_rate: m.cache_hit_rate,
        sidechain_rate: m.sidechain_rate,
        re_read_rate: m.re_read_rate,
        autonomy_score: m.autonomy_score,
        metrics_finalized: m.metrics_finalized,
        finalized_at: m.finalized_at
      } : nil
    }
  end
end
