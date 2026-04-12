FactoryBot.define do
  factory :pr_file do
    pr
    sequence(:filename) { |n| "src/file#{n}.rb" }
    additions { 10 }
    deletions { 2 }
    line_changes { 12 }
    status { "modified" }
  end
end
