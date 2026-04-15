#!/usr/bin/env ruby
# frozen_string_literal: true
# Adds a resource file (e.g. fixture JSON) to a target's Resources build
# phase in BoxBoxNow.xcodeproj. Creates any missing classic PBXGroup
# hierarchy along the way. Idempotent.
# Usage: add_resource_to_target.rb <target_name> <relative_file_path>
# Example: add_resource_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Fixtures/foo.json
require 'xcodeproj'

PROJECT_PATH = File.expand_path('../../BoxBoxNow/BoxBoxNow.xcodeproj', __dir__)
target_name = ARGV[0] or abort 'usage: add_resource_to_target.rb <target> <path>'
rel_path    = ARGV[1] or abort 'usage: add_resource_to_target.rb <target> <path>'

project = Xcodeproj::Project.open(PROJECT_PATH)
target  = project.targets.find { |t| t.name == target_name } or abort "target #{target_name} not found"

# Navigate/create the group hierarchy matching the folder path.
parts = File.dirname(rel_path).split('/')
group = project.main_group
parts.each do |part|
  child = group.groups.find { |g| g.display_name == part } || group.new_group(part, part)
  group = child
end

filename = File.basename(rel_path)
file_ref = group.files.find { |f| f.display_name == filename } || group.new_reference(filename)

unless target.resources_build_phase.files.any? { |bf| bf.file_ref == file_ref }
  # The second arg (true) tells xcodeproj to suppress its own duplicate-check
  # pass on the build files array. We already did the de-dup check above via
  # files.any? { |bf| bf.file_ref == file_ref }, so asking the gem to repeat
  # it is redundant work. Same convention as add_file_to_target.rb.
  target.resources_build_phase.add_file_reference(file_ref, true)
end

project.save
puts "Resource #{rel_path} → #{target_name}"
