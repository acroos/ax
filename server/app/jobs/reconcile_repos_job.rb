class ReconcileReposJob < ApplicationJob
  queue_as :default

  def perform
    # GitHub repos with active installations
    Repo.joins(:github_installation)
        .where(github_installations: { status: "active" })
        .find_each do |repo|
      BackfillRepoJob.perform_later(repo.id)
    end

    # GitLab repos with active connections
    Repo.joins(:gitlab_connection)
        .where(gitlab_connections: { status: "active" })
        .find_each do |repo|
      BackfillGitlabRepoJob.perform_later(repo.id)
    end
  end
end
