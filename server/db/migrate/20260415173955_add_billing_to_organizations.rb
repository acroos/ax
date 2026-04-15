class AddBillingToOrganizations < ActiveRecord::Migration[8.1]
  def change
    add_column :organizations, :plan, :string, default: "free", null: false unless column_exists?(:organizations, :plan)
    add_column :organizations, :stripe_customer_id, :string unless column_exists?(:organizations, :stripe_customer_id)
    add_column :organizations, :plan_overrides, :jsonb, default: {}, null: false unless column_exists?(:organizations, :plan_overrides)

    add_index :organizations, :stripe_customer_id, unique: true, where: "stripe_customer_id IS NOT NULL" unless index_exists?(:organizations, :stripe_customer_id)

    create_table :subscriptions do |t|
      t.references :organization, null: false, foreign_key: true, index: true
      t.string :stripe_subscription_id, null: false
      t.string :status, null: false, default: "active"
      t.datetime :current_period_start
      t.datetime :current_period_end
      t.boolean :cancel_at_period_end, default: false, null: false
      t.datetime :canceled_at
      t.timestamps
    end

    add_index :subscriptions, :stripe_subscription_id, unique: true
    add_index :subscriptions, [ :organization_id, :status ]
  end
end
