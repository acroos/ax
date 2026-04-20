class PersonalDataExportService
  def initialize(user)
    @user = user
  end

  def call
    {
      exported_at: Time.current.iso8601,
      user: user_data,
      organizations: org_data,
      pull_requests: pr_data,
      sessions: session_data
    }
  end

  private

  def user_data
    {
      id: @user.id,
      github_id: @user.github_id,
      github_username: @user.github_username,
      email: @user.email,
      display_name: @user.display_name,
      created_at: @user.created_at&.iso8601,
      last_login_at: @user.last_login_at&.iso8601
    }
  end

  def org_data
    @user.org_memberships.includes(:organization).map do |membership|
      {
        organization: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
        joined_at: membership.joined_at&.iso8601
      }
    end
  end

  def pr_data
    Pr.joins(:repo)
      .where(author: @user.github_username)
      .order(created_at: :desc)
      .limit(1000)
      .map do |pr|
        {
          repo: "#{pr.repo.github_owner}/#{pr.repo.github_repo}",
          number: pr.number,
          title: pr.title,
          state: pr.state,
          branch: pr.branch,
          created_at: pr.created_at&.iso8601,
          merged_at: pr.merged_at&.iso8601,
          closed_at: pr.closed_at&.iso8601,
          additions: pr.additions,
          deletions: pr.deletions
        }
      end
  end

  def session_data
    CodingSession.where(pushed_by: @user.github_username)
      .order(started_at: :desc)
      .limit(1000)
      .map do |session|
        {
          id: session.id,
          branch: session.branch,
          started_at: session.started_at&.iso8601,
          ended_at: session.ended_at&.iso8601,
          message_count: session.message_count,
          turn_count: session.turn_count,
          input_tokens: session.input_tokens,
          output_tokens: session.output_tokens,
          total_cost_usd: session.total_cost_usd,
          primary_model: session.primary_model
        }
      end
  end
end
