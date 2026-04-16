class AddSeatFieldsToSubscriptions < ActiveRecord::Migration[8.1]
  def change
    add_column :subscriptions, :stripe_subscription_item_id, :string
    add_column :subscriptions, :quantity, :integer, default: 1, null: false
  end
end
