require "rails_helper"

RSpec.describe ProcessedStripeEvent do
  describe "validations" do
    it "requires event_id" do
      event = ProcessedStripeEvent.new(event_id: nil)
      expect(event).not_to be_valid
      expect(event.errors[:event_id]).to include("can't be blank")
    end

    it "enforces uniqueness of event_id" do
      ProcessedStripeEvent.create!(event_id: "evt_123")
      duplicate = ProcessedStripeEvent.new(event_id: "evt_123")
      expect(duplicate).not_to be_valid
      expect(duplicate.errors[:event_id]).to include("has already been taken")
    end

    it "saves a valid event" do
      event = ProcessedStripeEvent.new(event_id: "evt_abc")
      expect(event).to be_valid
    end
  end
end
