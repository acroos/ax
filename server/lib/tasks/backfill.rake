namespace :backfill do
  desc "Re-backfill all active GitHub App installations (re-fetches PR data, reviews, and recomputes metrics)"
  task installations: :environment do
    installations = GithubInstallation.where(status: "active").where.not(organization_id: nil)
    count = installations.count

    if count == 0
      puts "No active installations found."
      next
    end

    puts "Found #{count} active installation(s). Starting re-backfill..."

    installations.find_each do |installation|
      org = installation.organization
      puts "\n--- #{org.slug} (installation ##{installation.github_installation_id}) ---"

      # Unfinalize all PR metrics so they can be recomputed
      repo_ids = installation.repos.pluck(:id)
      unfinalzed = PrMetrics.joins(:pr).where(prs: { repo_id: repo_ids }, metrics_finalized: true).update_all(
        metrics_finalized: false,
        finalized_at: nil
      )
      puts "  Unfinalized #{unfinalzed} PR metrics records"

      # Run the backfill job synchronously
      GithubApp::BackfillInstallationJob.perform_now(installation.id)
      puts "  Backfill complete"
    rescue => e
      puts "  ERROR: #{e.class}: #{e.message}"
    end

    puts "\nDone."
  end

  desc "Re-backfill a single installation by org slug"
  task :installation, [ :org_slug ] => :environment do |_t, args|
    slug = args[:org_slug]
    if slug.blank?
      puts "Usage: rails backfill:installation[org-slug]"
      next
    end

    org = Organization.find_by(slug: slug)
    unless org
      puts "Organization '#{slug}' not found."
      next
    end

    installation = org.github_installations.find_by(status: "active")
    unless installation
      puts "No active GitHub App installation for '#{slug}'."
      next
    end

    puts "Re-backfilling #{slug} (installation ##{installation.github_installation_id})..."

    # Unfinalize all PR metrics so they can be recomputed
    repo_ids = installation.repos.pluck(:id)
    unfinalzed = PrMetrics.joins(:pr).where(prs: { repo_id: repo_ids }, metrics_finalized: true).update_all(
      metrics_finalized: false,
      finalized_at: nil
    )
    puts "  Unfinalized #{unfinalzed} PR metrics records"

    GithubApp::BackfillInstallationJob.perform_now(installation.id)
    puts "Done."
  end
end
