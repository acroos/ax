require "rails_helper"

RSpec.describe AuthService do
  let(:auth_hash) do
    OmniAuth::AuthHash.new(
      uid: "12345",
      info: OmniAuth::AuthHash::InfoHash.new(
        nickname: "octocat",
        email: "octocat@github.com",
        name: "The Octocat",
        image: "https://avatars.githubusercontent.com/u/12345"
      )
    )
  end

  describe ".find_or_create_from_github" do
    it "creates a new user with personal org" do
      user = AuthService.find_or_create_from_github(auth_hash)

      expect(user).to be_persisted
      expect(user.github_id).to eq(12345)
      expect(user.github_username).to eq("octocat")
      expect(user.personal_org).to be_present
      expect(user.personal_org.slug).to eq("octocat")
      expect(user.personal_org.is_personal).to be true
    end

    it "generates an API key for new users" do
      user = AuthService.find_or_create_from_github(auth_hash)
      expect(user.api_key).to be_present
    end

    it "updates existing user on return login" do
      AuthService.find_or_create_from_github(auth_hash)

      updated_hash = auth_hash.dup
      updated_hash.info.name = "Updated Name"

      user = AuthService.find_or_create_from_github(updated_hash)
      expect(user.display_name).to eq("Updated Name")
      expect(User.count).to eq(1)
    end

    it "processes pending invites on login" do
      inviter = create(:user)
      org = create(:organization, created_by: inviter, plan: "pro")
      create(:org_membership, organization: org, user: inviter, role: "owner")

      Invite.create!(
        organization: org,
        github_username: "octocat",
        role: "member",
        invited_by: inviter,
        token: SecureRandom.hex(32),
        expires_at: 7.days.from_now
      )

      user = AuthService.find_or_create_from_github(auth_hash)
      expect(user.member_of?(org)).to be true
    end

    it "skips invite silently when org is at member limit" do
      inviter = create(:user)
      org = create(:organization, created_by: inviter) # free plan, max_members: 1
      create(:org_membership, organization: org, user: inviter, role: "owner")

      invite = Invite.create!(
        organization: org,
        github_username: "octocat",
        role: "member",
        invited_by: inviter,
        token: SecureRandom.hex(32),
        expires_at: 7.days.from_now
      )

      user = AuthService.find_or_create_from_github(auth_hash)
      expect(user.member_of?(org)).to be false
      expect(invite.reload.status).to eq("pending")
    end
  end

  describe ".ensure_can_create_org!" do
    it "raises if user is not on approved waitlist" do
      user = create(:user)
      expect { AuthService.ensure_can_create_org!(user) }
        .to raise_error(AuthService::ForbiddenError)
    end

    it "allows if user is approved on waitlist" do
      user = create(:user, github_username: "approved-user")
      WaitlistEntry.create!(email: "a@b.com", github_username: "approved-user", status: "approved")

      expect { AuthService.ensure_can_create_org!(user) }.not_to raise_error
    end
  end
end
