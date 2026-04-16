require "rails_helper"

RSpec.describe PlanService do
  let(:org) { create(:organization, plan: "free", plan_overrides: {}) }

  describe ".for" do
    it "returns a PlanService instance" do
      expect(PlanService.for(org)).to be_a(PlanService)
    end
  end

  describe "#capability" do
    it "returns numeric capabilities for free plan" do
      service = PlanService.for(org)
      expect(service.capability(:max_members)).to eq(1)
      expect(service.capability(:max_repos)).to eq(2)
    end

    it "returns boolean capabilities for free plan" do
      service = PlanService.for(org)
      expect(service.capability(:core_metrics)).to be true
      expect(service.capability(:compare_developers)).to be false
    end

    it "returns unlimited for pro plan without active subscription" do
      org.update!(plan: "pro")
      service = PlanService.for(org)
      expect(service.capability(:max_members)).to eq(Float::INFINITY)
      expect(service.capability(:max_repos)).to eq(Float::INFINITY)
    end

    it "returns subscription quantity as max_members for pro with active subscription" do
      org.update!(plan: "pro")
      create(:subscription, organization: org, quantity: 5, status: "active")
      service = PlanService.for(org.reload)

      expect(service.capability(:max_members)).to eq(5)
      expect(service.capability(:max_repos)).to eq(Float::INFINITY)
    end

    it "returns subscription quantity for trialing subscriptions too" do
      org.update!(plan: "pro")
      create(:subscription, organization: org, quantity: 3, status: "trialing")
      service = PlanService.for(org.reload)

      expect(service.capability(:max_members)).to eq(3)
    end

    it "falls back to base config when subscription is canceled" do
      org.update!(plan: "pro")
      create(:subscription, organization: org, quantity: 5, status: "canceled")
      service = PlanService.for(org.reload)

      expect(service.capability(:max_members)).to eq(Float::INFINITY)
    end

    it "lets plan_overrides take precedence over subscription quantity" do
      org.update!(plan: "pro", plan_overrides: { "max_members" => 100 })
      create(:subscription, organization: org, quantity: 5, status: "active")
      service = PlanService.for(org.reload)

      expect(service.capability(:max_members)).to eq(100)
    end

    it "returns pro features for pro plan" do
      org.update!(plan: "pro")
      service = PlanService.for(org)
      expect(service.capability(:compare_developers)).to be true
      expect(service.capability(:export_data)).to be true
    end

    it "falls back to free plan for unknown plan names" do
      org.update!(plan: "nonexistent")
      service = PlanService.for(org)
      expect(service.capability(:max_members)).to eq(1)
    end

    it "applies per-org overrides over plan defaults" do
      org.update!(plan_overrides: { "max_repos" => 10 })
      service = PlanService.for(org)
      expect(service.capability(:max_repos)).to eq(10)
      expect(service.capability(:max_members)).to eq(1) # non-overridden stays at default
    end

    it "returns nil for unknown capabilities" do
      service = PlanService.for(org)
      expect(service.capability(:nonexistent)).to be_nil
    end
  end

  describe "#can?" do
    it "returns true for enabled boolean capabilities" do
      service = PlanService.for(org)
      expect(service.can?(:core_metrics)).to be true
    end

    it "returns false for disabled boolean capabilities" do
      service = PlanService.for(org)
      expect(service.can?(:compare_developers)).to be false
    end

    it "returns true for numeric capabilities (truthy)" do
      service = PlanService.for(org)
      expect(service.can?(:max_repos)).to be true
    end

    it "respects overrides" do
      org.update!(plan_overrides: { "compare_developers" => true })
      service = PlanService.for(org)
      expect(service.can?(:compare_developers)).to be true
    end
  end

  describe "#within_limit?" do
    it "returns true when under the limit" do
      service = PlanService.for(org)
      expect(service.within_limit?(:max_repos, 1)).to be true
    end

    it "returns false when at the limit" do
      service = PlanService.for(org)
      expect(service.within_limit?(:max_repos, 2)).to be false
    end

    it "returns false when over the limit" do
      service = PlanService.for(org)
      expect(service.within_limit?(:max_repos, 5)).to be false
    end

    it "returns true for unlimited (pro plan)" do
      org.update!(plan: "pro")
      service = PlanService.for(org)
      expect(service.within_limit?(:max_repos, 999)).to be true
    end

    it "returns true for boolean capabilities" do
      service = PlanService.for(org)
      expect(service.within_limit?(:core_metrics, 0)).to be true
    end

    it "respects overrides on limits" do
      org.update!(plan_overrides: { "max_repos" => 10 })
      service = PlanService.for(org)
      expect(service.within_limit?(:max_repos, 5)).to be true
      expect(service.within_limit?(:max_repos, 10)).to be false
    end
  end

  describe "#plan_name" do
    it "returns the plan name" do
      expect(PlanService.for(org).plan_name).to eq("free")
    end
  end

  describe "#plan_details" do
    it "returns serializable hash with nil for unlimited" do
      org.update!(plan: "pro")
      details = PlanService.for(org).plan_details
      expect(details[:name]).to eq("pro")
      expect(details[:capabilities][:max_members]).to be_nil
      expect(details[:capabilities][:max_repos]).to be_nil
      expect(details[:capabilities][:compare_developers]).to be true
    end

    it "includes the seat count as max_members for pro with active subscription" do
      org.update!(plan: "pro")
      create(:subscription, organization: org, quantity: 7, status: "active")
      details = PlanService.for(org.reload).plan_details

      expect(details[:capabilities][:max_members]).to eq(7)
      expect(details[:capabilities][:max_repos]).to be_nil
    end

    it "returns numeric values for free plan" do
      details = PlanService.for(org).plan_details
      expect(details[:name]).to eq("free")
      expect(details[:capabilities][:max_members]).to eq(1)
      expect(details[:capabilities][:max_repos]).to eq(2)
    end

    it "merges overrides into details" do
      org.update!(plan_overrides: { "max_repos" => 10 })
      details = PlanService.for(org).plan_details
      expect(details[:capabilities][:max_repos]).to eq(10)
    end
  end
end
