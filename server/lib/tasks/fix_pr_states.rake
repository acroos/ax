namespace :data do
  desc "Fix merged PRs that were incorrectly saved with state='closed'"
  task fix_merged_pr_states: :environment do
    updated = Pr.where(state: "closed").where.not(merged_at: nil).update_all(state: "merged")
    puts "Fixed #{updated} PR(s): state changed from 'closed' to 'merged'"
  end
end
