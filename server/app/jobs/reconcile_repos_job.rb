class ReconcileReposJob < ApplicationJob
  queue_as :default

  def perform
    Repo.joins(:github_installation)
        .where(github_installations: { status: "active" })
        .find_each do |repo|
      BackfillRepoJob.perform_later(repo.id)
    end
  end
end
