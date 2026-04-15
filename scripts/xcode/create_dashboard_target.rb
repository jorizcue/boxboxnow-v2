#!/usr/bin/env ruby
# Creates BoxBoxNowDashboard target in BoxBoxNow.xcodeproj.
# Idempotent: safe to re-run. Exits 0 if target already exists.
require 'xcodeproj'

PROJECT_PATH = File.expand_path('../../BoxBoxNow/BoxBoxNow.xcodeproj', __dir__)
TARGET_NAME  = 'BoxBoxNowDashboard'
BUNDLE_ID    = 'com.jizcue.BoxBoxNowDashboard'
DEPLOY_MIN   = '17.0'
DASHBOARD_DIR = File.expand_path('../../BoxBoxNow/BoxBoxNowDashboard', __dir__)

project = Xcodeproj::Project.open(PROJECT_PATH)

if project.targets.any? { |t| t.name == TARGET_NAME }
  puts "Target #{TARGET_NAME} already exists — no-op."
  exit 0
end

target = project.new_target(:application, TARGET_NAME, :ios, DEPLOY_MIN)
target.build_configurations.each do |cfg|
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  cfg.build_settings['TARGETED_DEVICE_FAMILY'] = '2' # iPad only
  cfg.build_settings['INFOPLIST_FILE'] = 'BoxBoxNowDashboard/Info.plist'
  cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOY_MIN
  cfg.build_settings['SWIFT_VERSION'] = '5.0'
  cfg.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  cfg.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  cfg.build_settings['DEVELOPMENT_TEAM'] = '$(DEVELOPMENT_TEAM)'
  cfg.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  cfg.build_settings['ENABLE_PREVIEWS'] = 'YES'
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'BoxBoxNowDashboard/BoxBoxNowDashboard.entitlements'
end

# Create the BoxBoxNowDashboard group if absent
group = project.main_group.find_subpath('BoxBoxNowDashboard', true)
group.set_source_tree('<group>')

# Also create the tests target
test_target = project.new_target(:unit_test_bundle, 'BoxBoxNowDashboardTests', :ios, DEPLOY_MIN)
test_target.build_configurations.each do |cfg|
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID}.tests"
  cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOY_MIN
  cfg.build_settings['TARGETED_DEVICE_FAMILY'] = '2'
  cfg.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  cfg.build_settings['TEST_HOST'] = "$(BUILT_PRODUCTS_DIR)/#{TARGET_NAME}.app/#{TARGET_NAME}"
  cfg.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
end
test_target.add_dependency(target)

ui_target = project.new_target(:ui_test_bundle, 'BoxBoxNowDashboardUITests', :ios, DEPLOY_MIN)
ui_target.build_configurations.each do |cfg|
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = "#{BUNDLE_ID}.uitests"
  cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOY_MIN
  cfg.build_settings['TARGETED_DEVICE_FAMILY'] = '2'
  cfg.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  cfg.build_settings['TEST_TARGET_NAME'] = TARGET_NAME
end
ui_target.add_dependency(target)

project.save
puts "Created target #{TARGET_NAME} + Tests + UITests in #{PROJECT_PATH}"
