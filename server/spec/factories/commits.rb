FactoryBot.define do
  factory :commit do
    sequence(:sha) { |n| Digest::SHA1.hexdigest("commit#{n}") }
    repo
    author { "developer" }
    message { "A commit" }
    additions { 10 }
    deletions { 2 }
  end
end
