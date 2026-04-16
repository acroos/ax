namespace :org do
  desc "Delete all data for an organization (repos, PRs, sessions, metrics, installations, memberships, invites)"
  task :clear_data, [ :org_slug ] => :environment do |_t, args|
    slug = args[:org_slug]
    if slug.blank?
      puts "Usage: rails org:clear_data[org-slug]"
      next
    end

    org = Organization.find_by(slug: slug)
    unless org
      puts "Organization '#{slug}' not found."
      next
    end

    puts "This will delete ALL data for '#{org.name}' (#{slug}):"
    puts "  - Repos, PRs, commits, sessions, metrics, PR files"
    puts "  - GitHub installations and watched repos"
    puts "  - Invites"
    puts "  - The organization, its memberships, and the record itself will be KEPT"
    puts ""
    print "Type the org slug to confirm: "
    confirmation = $stdin.gets&.strip

    unless confirmation == slug
      puts "Aborted."
      next
    end

    repo_ids = org.repos.pluck(:id)
    pr_ids = Pr.where(repo_id: repo_ids).pluck(:id)

    ActiveRecord::Base.transaction do
      # Leaf tables first
      deleted = PrFile.where(pr_id: pr_ids).delete_all
      puts "  Deleted #{deleted} PR files"

      deleted = PrMetrics.where(pr_id: pr_ids).delete_all
      puts "  Deleted #{deleted} PR metrics"

      deleted = SessionPr.where(pr_id: pr_ids).delete_all
      puts "  Deleted #{deleted} session-PR links"

      deleted = Commit.where(repo_id: repo_ids).delete_all
      puts "  Deleted #{deleted} commits"

      deleted = Pr.where(repo_id: repo_ids).delete_all
      puts "  Deleted #{deleted} PRs"

      deleted = CodingSession.where(repo_id: repo_ids).delete_all
      puts "  Deleted #{deleted} sessions"

      deleted = RepoMetrics.where(repo_id: repo_ids).delete_all
      puts "  Deleted #{deleted} repo metrics"

      deleted = WatchedRepo.where(repo_id: repo_ids).delete_all
      puts "  Deleted #{deleted} watched repos"

      deleted = org.repos.delete_all
      puts "  Deleted #{deleted} repos"

      deleted = org.github_installations.delete_all
      puts "  Deleted #{deleted} GitHub installations"

      deleted = org.invites.delete_all
      puts "  Deleted #{deleted} invites"
    end

    puts "\nDone. Organization '#{slug}' is now empty. Re-install the GitHub App to start fresh."
  end
end
