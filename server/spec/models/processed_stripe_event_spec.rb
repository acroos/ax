require "rails_helper"

RSpec.describe ProcessedStripeEvent do
  describe "validations" do
    it "requires event_id" do
      event = ProcessedStripeEvent.new(event_id: nil)
      expect(event).not_to be_valid
      expect(event.errors[:event_id]).to include("can't be blank")
    end

    it "saves a valid event" do
      event = ProcessedStripeEvent.new(event_id: "evt_abc")
      expect(event).to be_valid
    end
  end

  describe "uniqueness" do
    it "enforces uniqueness at the database level" do
      ProcessedStripeEvent.create!(event_id: "evt_123")
      expect {
        ProcessedStripeEvent.connection.execute(
          "INSERT INTO processed_stripe_events (event_id, created_at, updated_at) VALUES ('evt_123', NOW(), NOW())"
        )
      }.to raise_error(ActiveRecord::StatementInvalid)
    end
  end
end
