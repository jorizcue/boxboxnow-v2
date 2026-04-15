#!/usr/bin/env ruby
# frozen_string_literal: true
#
# Adds BoxBoxNow/Shared as a PBXFileSystemSynchronizedRootGroup in
# BoxBoxNow/BoxBoxNow.xcodeproj, with both the driver (BoxBoxNow) and the
# dashboard (BoxBoxNowDashboard) targets as members. Idempotent: if a synced
# root for Shared already exists, the script verifies target membership and
# exits 0 without duplicating it.
#
# Why: the project uses Xcode 16's synchronized root group model, which does
# not map cleanly onto the xcodeproj gem's classic add_file_references API.
# The driver's source files have no PBXFileReference for us to reuse, so we
# cannot simply append them to the dashboard's sources build phase. Instead,
# we move the 11 shared files under BoxBoxNow/Shared/ and register that
# directory as its own synchronized root group owned by both targets.
#
# xcodeproj gem 1.27.0 exposes the PBXNativeTarget.fileSystemSynchronizedGroups
# relationship as the snake_case accessor `file_system_synchronized_groups`
# (see native_target.rb line 467 in the gem source), so we use that directly.

require 'xcodeproj'

PROJECT_PATH = File.expand_path('../../BoxBoxNow/BoxBoxNow.xcodeproj', __dir__)
SHARED_PATH  = 'Shared' # relative to the directory containing the .xcodeproj
DRIVER_TARGET    = 'BoxBoxNow'
DASHBOARD_TARGET = 'BoxBoxNowDashboard'

project = Xcodeproj::Project.open(PROJECT_PATH)

driver    = project.targets.find { |t| t.name == DRIVER_TARGET } \
  or abort "target #{DRIVER_TARGET} not found"
dashboard = project.targets.find { |t| t.name == DASHBOARD_TARGET } \
  or abort "target #{DASHBOARD_TARGET} not found"

# Find an existing Shared synced root, if any. We scan the main group's
# direct children because synchronized roots live there (mirroring the
# existing `BoxBoxNow` synced root, which is a child of the main group).
existing_shared = project.main_group.children.find do |c|
  c.is_a?(Xcodeproj::Project::Object::PBXFileSystemSynchronizedRootGroup) &&
    c.path == SHARED_PATH
end

if existing_shared
  warn "Shared synced root already present (uuid=#{existing_shared.uuid}), ensuring target membership."
  group = existing_shared
else
  group = project.new(Xcodeproj::Project::Object::PBXFileSystemSynchronizedRootGroup)
  group.path        = SHARED_PATH
  group.source_tree = '<group>'
  project.main_group.children << group
  puts "Created PBXFileSystemSynchronizedRootGroup path=#{SHARED_PATH} uuid=#{group.uuid}"
end

# Ensure both targets list the group in fileSystemSynchronizedGroups.
[driver, dashboard].each do |t|
  if t.file_system_synchronized_groups.include?(group)
    puts "#{t.name} already owns #{SHARED_PATH}"
  else
    t.file_system_synchronized_groups << group
    puts "Added #{SHARED_PATH} to #{t.name}.fileSystemSynchronizedGroups"
  end
end

project.save
puts 'OK'
