FactoryBot.define do
  factory :invite do
    organization
    invited_by { association(:user) }
    github_username { "invitee" }
    role { "member" }
    status { "pending" }
  end
end
