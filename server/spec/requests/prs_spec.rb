require "rails_helper"

RSpec.describe "PRs API", type: :request do
  let(:owner) { create(:user) }
  let(:org) { create(:organization, created_by: owner, plan: "free") }
  let(:repo) { create(:repo, organization: org) }

  before do
    create(:org_membership, organization: org, user: owner, role: "owner")
  end

  def session_headers(user)
    session = UserSession.create!(user: user, expires_at: 30.days.from_now)
    { "X-Ax-Session" => session.session_token }
  end

  describe "GET /api/v1/prs/:id" do
    let(:pr) { create(:pr, repo: repo, created_at_source: 10.days.ago.iso8601) }
    let!(:metrics) { create(:pr_metrics, pr: pr, metrics_finalized: true) }

    it "requires session auth" do
      get "/api/v1/prs/#{pr.id}"
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 403 for non-member" do
      outsider = create(:user)
      get "/api/v1/prs/#{pr.id}", headers: session_headers(outsider)
      expect(response).to have_http_status(:forbidden)
    end

    it "returns PR data for a member" do
      get "/api/v1/prs/#{pr.id}", headers: session_headers(owner)
      expect(response).to have_http_status(:ok)

      body = JSON.parse(response.body)
      expect(body["id"]).to eq(pr.id)
      expect(body["number"]).to eq(pr.number)
      expect(body["metrics"]).to be_present
    end

    context "history cutoff on free plan" do
      it "returns 403 for PRs older than history_days" do
        old_pr = create(:pr, repo: repo, created_at_source: 60.days.ago.iso8601)
        create(:pr_metrics, pr: old_pr, metrics_finalized: true)

        get "/api/v1/prs/#{old_pr.id}", headers: session_headers(owner)
        expect(response).to have_http_status(:forbidden)
      end

      it "allows PRs within history_days" do
        get "/api/v1/prs/#{pr.id}", headers: session_headers(owner)
        expect(response).to have_http_status(:ok)
      end

      it "allows PRs without created_at_source" do
        pr.update!(created_at_source: nil)

        get "/api/v1/prs/#{pr.id}", headers: session_headers(owner)
        expect(response).to have_http_status(:ok)
      end
    end

    context "history cutoff on pro plan" do
      before { org.update!(plan: "pro") }

      it "allows old PRs" do
        old_pr = create(:pr, repo: repo, created_at_source: 365.days.ago.iso8601)
        create(:pr_metrics, pr: old_pr, metrics_finalized: true)

        get "/api/v1/prs/#{old_pr.id}", headers: session_headers(owner)
        expect(response).to have_http_status(:ok)
      end
    end

    context "history cutoff with plan_overrides" do
      it "respects custom history_days override" do
        org.update!(plan_overrides: { history_days: 7 })

        recent_pr = create(:pr, repo: repo, created_at_source: 5.days.ago.iso8601)
        create(:pr_metrics, pr: recent_pr, metrics_finalized: true)
        old_pr = create(:pr, repo: repo, created_at_source: 10.days.ago.iso8601)
        create(:pr_metrics, pr: old_pr, metrics_finalized: true)

        get "/api/v1/prs/#{recent_pr.id}", headers: session_headers(owner)
        expect(response).to have_http_status(:ok)

        get "/api/v1/prs/#{old_pr.id}", headers: session_headers(owner)
        expect(response).to have_http_status(:forbidden)
      end
    end
  end
end
