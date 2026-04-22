module PrSerialization
  extend ActiveSupport::Concern
  include CursorPagination

  private

  def render_paginated_prs(scope)
    result = paginate(scope)
    render json: {
      data: result[:records].map { |pr| pr_with_metrics(pr) },
      pagination: {
        next_cursor: result[:next_cursor],
        has_more: result[:has_more],
        total: result[:total]
      }
    }
  end

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
        post_open_commits: m.post_open_commits,
        ci_success_rate: m.ci_success_rate,
        line_revisit_rate: m.line_revisit_rate,
        metrics_finalized: m.metrics_finalized,
        finalized_at: m.finalized_at
      } : nil
    }
  end
end
