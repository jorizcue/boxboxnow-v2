#!/usr/bin/env ruby
# Adds a source file to a target in BoxBoxNow.xcodeproj, creating any missing group hierarchy.
# Usage: add_file_to_target.rb <target_name> <relative_file_path>
# Example: add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/Design/BBNColors.swift
require 'xcodeproj'

PROJECT_PATH = File.expand_path('../../BoxBoxNow/BoxBoxNow.xcodeproj', __dir__)
target_name = ARGV[0] or abort 'usage: add_file_to_target.rb <target> <path>'
rel_path    = ARGV[1] or abort 'usage: add_file_to_target.rb <target> <path>'

project = Xcodeproj::Project.open(PROJECT_PATH)
target  = project.targets.find { |t| t.name == target_name } or abort "target #{target_name} not found"

# Navigate/create the group hierarchy matching the folder path
parts = File.dirname(rel_path).split('/')
group = project.main_group
parts.each do |part|
  child = group.groups.find { |g| g.display_name == part } || group.new_group(part, part)
  group = child
end

filename = File.basename(rel_path)
existing = group.files.find { |f| f.display_name == filename }
if existing
  unless target.source_build_phase.files.any? { |bf| bf.file_ref == existing }
    target.add_file_references([existing])
  end
else
  file_ref = group.new_reference(filename)
  target.add_file_references([file_ref])
end

project.save
puts "Added #{rel_path} to #{target_name}"
