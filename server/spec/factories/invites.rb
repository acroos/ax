FactoryBot.define do
  factory :invite do
    organization
    invited_by { association(:user) }
    github_username { "invitee" }
    platform { "github" }
    role { "member" }
    status { "pending" }

    trait :gitlab do
      platform { "gitlab" }
      github_username { nil }
      gitlab_username { "gl-invitee" }
    end
  end
end
