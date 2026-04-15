class CreateProcessedStripeEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :processed_stripe_events do |t|
      t.string :event_id, null: false, index: { unique: true }
      t.timestamps
    end
  end
end
