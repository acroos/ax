require "rails_helper"

RSpec.describe PrFile do
  describe "validations" do
    it "requires filename" do
      pr_file = build(:pr_file, filename: nil)
      expect(pr_file).not_to be_valid
    end

    it "requires unique filename per PR" do
      pr = create(:pr)
      create(:pr_file, pr: pr, filename: "src/app.rb")
      duplicate = build(:pr_file, pr: pr, filename: "src/app.rb")
      expect(duplicate).not_to be_valid
    end

    it "allows same filename on different PRs" do
      file1 = create(:pr_file, filename: "src/app.rb")
      file2 = build(:pr_file, filename: "src/app.rb")
      expect(file2).to be_valid
    end
  end

  describe "associations" do
    it "belongs to a PR" do
      pr_file = create(:pr_file)
      expect(pr_file.pr).to be_a(Pr)
    end
  end
end
