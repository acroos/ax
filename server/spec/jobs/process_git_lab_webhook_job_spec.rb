require "rails_helper"

RSpec.describe ProcessGitLabWebhookJob, type: :job do
  let(:organization) { create(:organization) }
  let(:connection) { create(:gitlab_connection, organization: organization) }
  let(:repo) { create(:repo, organization: organization, gitlab_connection: connection, platform: "gitlab", platform_owner: "acme", platform_repo: "api", gitlab_project_id: 123) }

  let(:mr_payload) do
    {
      object_kind: "merge_request",
      project: { namespace: "acme", path: "api", path_with_namespace: "acme/api" },
      object_attributes: {
        iid: 42,
        title: "Fix login bug",
        source_branch: "fix-login",
        state: "opened",
        action: "open",
        created_at: "2026-04-20T10:00:00Z",
        url: "https://gitlab.com/acme/api/-/merge_requests/42"
      }
    }.to_json
  end

  let(:pipeline_payload) do
    {
      object_kind: "pipeline",
      project: { namespace: "acme", path: "api", path_with_namespace: "acme/api" },
      object_attributes: {
        id: 999,
        sha: "abc123",
        status: "success"
      }
    }.to_json
  end

  before { repo } # ensure repo exists

  describe "deduplication" do
    it "processes the same event only once" do
      allow(WebhookHandlers::Gitlab::MrOpened).to receive(:new).and_call_original

      described_class.new.perform(mr_payload, "uuid-1")
      described_class.new.perform(mr_payload, "uuid-1")

      expect(WebhookHandlers::Gitlab::MrOpened).to have_received(:new).once
    end

    it "processes events without UUID (backward compatibility)" do
      allow(WebhookHandlers::Gitlab::MrOpened).to receive(:new).and_call_original

      described_class.new.perform(mr_payload, nil)

      expect(WebhookHandlers::Gitlab::MrOpened).to have_received(:new).once
    end
  end

  describe "merge request routing" do
    it "routes open action to MrOpened" do
      expect {
        described_class.new.perform(mr_payload, "uuid-open")
      }.to change(Pr, :count).by(1)

      pr = Pr.last
      expect(pr.number).to eq(42)
      expect(pr.title).to eq("Fix login bug")
      expect(pr.state).to eq("open")
    end

    it "routes merge action to MrMerged" do
      # Create the PR first
      create(:pr, repo: repo, number: 42)

      merged_payload = JSON.parse(mr_payload)
      merged_payload["object_attributes"]["action"] = "merge"
      merged_payload["object_attributes"]["state"] = "merged"
      merged_payload["object_attributes"]["merged_at"] = "2026-04-21T10:00:00Z"

      # Stub the GitLab API calls that MrMerged makes
      allow_any_instance_of(GitlabDataFetcher).to receive(:call)

      described_class.new.perform(merged_payload.to_json, "uuid-merge")

      pr = Pr.find_by(repo: repo, number: 42)
      expect(pr.state).to eq("merged")
    end
  end

  describe "pipeline routing" do
    it "ignores pipeline events when commit is not found" do
      expect {
        described_class.new.perform(pipeline_payload, "uuid-pipeline")
      }.not_to raise_error
    end

    it "updates ci_passed on matching commit" do
      commit = create(:commit, sha: "abc123", repo: repo, ci_passed: nil)

      described_class.new.perform(pipeline_payload, "uuid-pipeline-2")

      expect(commit.reload.ci_passed).to eq(true)
    end
  end

  it "ignores events from unknown repos" do
    unknown_payload = {
      object_kind: "merge_request",
      project: { namespace: "unknown", path: "repo", path_with_namespace: "unknown/repo" },
      object_attributes: { iid: 1, action: "open" }
    }.to_json

    expect {
      described_class.new.perform(unknown_payload, "uuid-unknown")
    }.not_to raise_error
  end
end
