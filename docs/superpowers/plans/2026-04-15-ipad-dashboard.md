# iPad Native Dashboard App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a native iPad app (`BoxBoxNowDashboard`) that replicates the web dashboard 1:1 — all 15 modules minus the account/subscription module — as a new target inside the existing `BoxBoxNow.xcodeproj`, reusing the driver app's low-level services via Target Membership.

**Architecture:** New `BoxBoxNowDashboard` target (iPadOS 17+, landscape-only) sharing `Services/`, `Models/`, `Utilities/` with the existing driver app via Target Membership. New files live under `BoxBoxNowDashboard/` in folders `App/`, `Design/`, `Models/`, `Services/`, `Stores/`, `Features/`, `Navigation/`. State management uses `@Observable` stores (iOS 17 macro) with a Swift `actor RaceWebSocketClient` to isolate WebSocket concurrency. Auth via shared Keychain Access Group enables cross-app SSO with the driver. No subscription/billing code ported.

**Tech Stack:** Swift 5.9+, SwiftUI (iOS 17+), `@Observable` macro, Swift `actor`, `NavigationSplitView`, Swift Charts, `Canvas`, `WKWebView`, `ASWebAuthenticationSession`, `URLSessionWebSocketTask`, XCTest, `xcodeproj` Ruby gem.

**Delivery mode:** Single continuous pass A → B → C → D. Phase boundaries are internal engineering milestones, not release gates. Final TestFlight build happens at the end of Phase D.

---

## File Map

### Shared files (existing, add Target Membership to BoxBoxNowDashboard)

| File | Action | Responsibility |
|------|--------|----------------|
| `BoxBoxNow/Services/APIClient.swift` | Share + extend | Base REST client; dashboard adds endpoints via extensions |
| `BoxBoxNow/Services/KeychainHelper.swift` | Share | Token storage (shared access group) |
| `BoxBoxNow/Services/BiometricService.swift` | Share | Face ID / Touch ID |
| `BoxBoxNow/Services/WebSocketClient.swift` | Share (unchanged) | Driver app keeps using it |
| `BoxBoxNow/Models/User.swift` | Share + extend | Add `createdAt`, `subscriptionStatus`, `sessionToken` |
| `BoxBoxNow/Models/KartState.swift` | Share + extend | Add `pitHistory`, `driverTotalMs`, `recentLaps`, etc. |
| `BoxBoxNow/Models/RaceConfig.swift` | Share + extend | Add `boxLines`, `pitClosedStartMin`, `finishLat1/2`, etc. Also extend `Circuit` with `lengthM`, `finishLat1/2`, `isActive` |
| `BoxBoxNow/Models/Team.swift` | Share | Team model |
| `BoxBoxNow/Models/GPSSample.swift` | Share | GPS sample |
| `BoxBoxNow/Utilities/Constants.swift` | Share + extend | Add `wsBaseURL`, dashboard-specific keys |
| `BoxBoxNow/Utilities/Formatters.swift` | Share + extend | Add lap-time, gap, cumulative-time formatters |

### New files (dashboard target only)

| File | Responsibility |
|------|---------------|
| `BoxBoxNowDashboard/App/BoxBoxNowDashboardApp.swift` | `@main` entry |
| `BoxBoxNowDashboard/App/AppDelegate.swift` | URL scheme callback |
| `BoxBoxNowDashboard/App/Info.plist` | Bundle config |
| `BoxBoxNowDashboard/Design/BBNColors.swift` | Color tokens |
| `BoxBoxNowDashboard/Design/BBNTypography.swift` | Font tokens |
| `BoxBoxNowDashboard/Design/Components/BBNCard.swift` | Card container |
| `BoxBoxNowDashboard/Design/Components/BBNPrimaryButton.swift` | Primary button |
| `BoxBoxNowDashboard/Design/Components/BBNTable.swift` | Table wrapper |
| `BoxBoxNowDashboard/Design/Components/BBNTierBadge.swift` | Tier indicator |
| `BoxBoxNowDashboard/Design/Components/BBNStatusDot.swift` | Animated dot |
| `BoxBoxNowDashboard/Design/Components/BBNSection.swift` | Section wrapper |
| `BoxBoxNowDashboard/Design/Components/BBNNumericField.swift` | Numeric input |
| `BoxBoxNowDashboard/Design/Components/BBNEmptyState.swift` | Empty state |
| `BoxBoxNowDashboard/Design/Components/BBNLoadingOverlay.swift` | Loading overlay |
| `BoxBoxNowDashboard/Design/Components/BBNToast.swift` | Toast notification |
| `BoxBoxNowDashboard/Models/JSONValue.swift` | Flexible JSON helper |
| `BoxBoxNowDashboard/Models/PitRecord.swift` | Pit history entry |
| `BoxBoxNowDashboard/Models/FifoEntry.swift` | Queue entry |
| `BoxBoxNowDashboard/Models/FifoState.swift` | Queue state |
| `BoxBoxNowDashboard/Models/FifoSnapshot.swift` | Historical snapshot |
| `BoxBoxNowDashboard/Models/ClassificationEntry.swift` | Classification row |
| `BoxBoxNowDashboard/Models/RaceSnapshot.swift` | Full race snapshot |
| `BoxBoxNowDashboard/Models/WsMessage.swift` | WS message envelope + type enum |
| `BoxBoxNowDashboard/Models/WsUpdateEvent.swift` | Per-event update payload |
| `BoxBoxNowDashboard/Models/ReplayStatus.swift` | Replay status |
| `BoxBoxNowDashboard/Models/DeviceSession.swift` | Device session (Config UI) |
| `BoxBoxNowDashboard/Models/UserListItem.swift` | Admin users row |
| `BoxBoxNowDashboard/Models/PlatformMetrics.swift` | Admin platform metrics |
| `BoxBoxNowDashboard/Services/APIClient+Dashboard.swift` | Shared `APIClient` extensions (generic get/post/patch/delete with query) |
| `BoxBoxNowDashboard/Services/AuthService.swift` | `/api/auth/*` |
| `BoxBoxNowDashboard/Services/RaceService.swift` | `/api/race/*` (REST) |
| `BoxBoxNowDashboard/Services/ConfigService.swift` | `/api/config/*` |
| `BoxBoxNowDashboard/Services/ReplayService.swift` | `/api/replay/*` |
| `BoxBoxNowDashboard/Services/AnalyticsService.swift` | `/api/analytics/*` |
| `BoxBoxNowDashboard/Services/InsightsService.swift` | `/api/insights/*` |
| `BoxBoxNowDashboard/Services/ApexReplayService.swift` | `/api/apex-replay/*` |
| `BoxBoxNowDashboard/Services/AdminService.swift` | `/api/admin/*` |
| `BoxBoxNowDashboard/Services/PublicService.swift` | `/api/public/*` |
| `BoxBoxNowDashboard/Services/RaceWebSocketClient.swift` | Actor-based WS client |
| `BoxBoxNowDashboard/Services/GoogleOAuthFlow.swift` | `ASWebAuthenticationSession` wrapper |
| `BoxBoxNowDashboard/Stores/AppStore.swift` | Root `@Observable` store |
| `BoxBoxNowDashboard/Stores/AuthStore.swift` | Auth state machine |
| `BoxBoxNowDashboard/Stores/RaceStore.swift` | Race state reducer |
| `BoxBoxNowDashboard/Stores/ConfigStore.swift` | Circuits/presets/preferences |
| `BoxBoxNowDashboard/Stores/AdminStore.swift` | Admin-only state |
| `BoxBoxNowDashboard/Features/Auth/AuthFlowView.swift` | Auth router |
| `BoxBoxNowDashboard/Features/Auth/LoginView.swift` | Email + password form |
| `BoxBoxNowDashboard/Features/Auth/MFACodeView.swift` | 6-digit TOTP input |
| `BoxBoxNowDashboard/Features/Auth/MFASetupView.swift` | QR + confirm |
| `BoxBoxNowDashboard/Features/Auth/BiometricLoginView.swift` | Face ID prompt |
| `BoxBoxNowDashboard/Features/Race/RaceTableView.swift` | Race module |
| `BoxBoxNowDashboard/Features/Race/KartDetailSheet.swift` | Kart detail sheet |
| `BoxBoxNowDashboard/Features/Pit/PitView.swift` | Pit module tab container |
| `BoxBoxNowDashboard/Features/Pit/FifoQueueView.swift` | FIFO queue view |
| `BoxBoxNowDashboard/Features/Pit/PitHistoryView.swift` | History tab |
| `BoxBoxNowDashboard/Features/Live/LiveView.swift` | `WKWebView` wrapper |
| `BoxBoxNowDashboard/Features/Classification/AdjustedClassificationView.swift` | Adjusted |
| `BoxBoxNowDashboard/Features/Classification/AdjustedBetaClassificationView.swift` | Adjusted Beta |
| `BoxBoxNowDashboard/Features/Config/ConfigView.swift` | Config tab container |
| `BoxBoxNowDashboard/Features/Config/Sessions/SessionsView.swift` | Device sessions |
| `BoxBoxNowDashboard/Features/Config/Teams/TeamsView.swift` | Teams editor |
| `BoxBoxNowDashboard/Features/Config/Circuits/CircuitsView.swift` | Circuit selector |
| `BoxBoxNowDashboard/Features/Config/Presets/PresetsView.swift` | Driver presets CRUD |
| `BoxBoxNowDashboard/Features/Config/Preferences/PreferencesView.swift` | Preferences |
| `BoxBoxNowDashboard/Features/Driver/DriverLiveView.swift` | Driver (pilot) view |
| `BoxBoxNowDashboard/Features/Driver/DriverConfigView.swift` | Drag-to-reorder config |
| `BoxBoxNowDashboard/Features/Replay/ReplayView.swift` | Replay module |
| `BoxBoxNowDashboard/Features/Replay/ReplayTimelineView.swift` | Canvas timeline |
| `BoxBoxNowDashboard/Features/Analytics/KartAnalyticsView.swift` | Analytics table |
| `BoxBoxNowDashboard/Features/Analytics/KartDetailSheet.swift` | Detail w/ charts |
| `BoxBoxNowDashboard/Features/Insights/GpsInsightsView.swift` | Tab container |
| `BoxBoxNowDashboard/Features/Insights/TrajectoryMapView.swift` | Canvas trajectory |
| `BoxBoxNowDashboard/Features/Insights/SpeedTraceView.swift` | Canvas speed |
| `BoxBoxNowDashboard/Features/Insights/GForceScatterView.swift` | Canvas g-forces |
| `BoxBoxNowDashboard/Features/Admin/AdminUsersView.swift` | Users admin |
| `BoxBoxNowDashboard/Features/Admin/AdminCircuitsView.swift` | Circuits admin |
| `BoxBoxNowDashboard/Features/Admin/AdminHubView.swift` | Hub admin |
| `BoxBoxNowDashboard/Features/Admin/AdminPlatformView.swift` | Platform metrics |
| `BoxBoxNowDashboard/Navigation/RootView.swift` | `NavigationSplitView` |
| `BoxBoxNowDashboard/Navigation/SidebarView.swift` | Sidebar |
| `BoxBoxNowDashboard/Navigation/SidebarItem.swift` | Enum |
| `BoxBoxNowDashboard/Navigation/DetailRouter.swift` | Detail router |
| `BoxBoxNowDashboard/Navigation/StatusBarView.swift` | Top status bar |
| `BoxBoxNowDashboard/Navigation/BoxCallOverlay.swift` | BOX call overlay |

### Tests

| File | Responsibility |
|------|---------------|
| `BoxBoxNowDashboardTests/Fixtures/snapshot.json` | Real backend snapshot |
| `BoxBoxNowDashboardTests/Fixtures/update.json` | Real backend update |
| `BoxBoxNowDashboardTests/Fixtures/fifo_update.json` | Real fifo update |
| `BoxBoxNowDashboardTests/Fixtures/replay_status.json` | Real replay status |
| `BoxBoxNowDashboardTests/Helpers/FixtureLoader.swift` | JSON fixture loader |
| `BoxBoxNowDashboardTests/Helpers/MockAPIClient.swift` | API mock |
| `BoxBoxNowDashboardTests/Helpers/MockRaceWebSocketClient.swift` | WS protocol mock |
| `BoxBoxNowDashboardTests/Helpers/MockKeychainHelper.swift` | Keychain mock |
| `BoxBoxNowDashboardTests/Models/JSONValueTests.swift` | Unit |
| `BoxBoxNowDashboardTests/Models/DecodeFixturesTests.swift` | Fixture decoding |
| `BoxBoxNowDashboardTests/Models/FormattersTests.swift` | Lap time formatting |
| `BoxBoxNowDashboardTests/Stores/AuthStoreStateMachineTests.swift` | State machine |
| `BoxBoxNowDashboardTests/Stores/RaceStoreReducerTests.swift` | Reducers |
| `BoxBoxNowDashboardTests/Stores/RaceStoreWebSocketIntegrationTests.swift` | WS integration |
| `BoxBoxNowDashboardTests/Services/AuthServiceTests.swift` | AuthService |
| `BoxBoxNowDashboardTests/Services/RaceServiceTests.swift` | RaceService |
| `BoxBoxNowDashboardUITests/LoginFlowTests.swift` | Login UI |
| `BoxBoxNowDashboardUITests/SidebarNavigationTests.swift` | Sidebar UI |
| `BoxBoxNowDashboardUITests/ReconnectBannerTests.swift` | Banner UI |
| `BoxBoxNowDashboardUITests/LogoutFlowTests.swift` | Logout UI |
| `BoxBoxNowDashboardUITests/AdminGatingTests.swift` | Permissions UI |

### Backend

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/api/auth_routes.py` | Modify | Add `/api/auth/google/ipad` + `/api/auth/google/callback/ipad` redirecting to `boxboxnowdashboard://auth?token=...` |

### Helper scripts

| File | Responsibility |
|------|---------------|
| `scripts/xcode/add_file_to_target.rb` | Ruby helper using `xcodeproj` gem to add files to a target |
| `scripts/xcode/create_dashboard_target.rb` | One-shot script to create the `BoxBoxNowDashboard` target |

---

## Preamble: Setup Tool Dependencies

Before starting Phase A, the engineer needs the `xcodeproj` Ruby gem to script `.pbxproj` mutations. This is the same gem CocoaPods uses internally — stable, well-maintained, non-destructive.

- [ ] **Install `xcodeproj` gem**

Run:
```bash
gem install --user-install xcodeproj
```

Expected: `Successfully installed xcodeproj-1.x.x`. If the user-install bin isn't on `PATH`, add the gem bin dir to `PATH` for the session (`export PATH="$(ruby -e 'puts Gem.user_dir')/bin:$PATH"`).

- [ ] **Verify gem is callable from a Ruby script**

Run:
```bash
ruby -e "require 'xcodeproj'; puts Xcodeproj::Project.open('BoxBoxNow/BoxBoxNow.xcodeproj').targets.map(&:name)"
```

Expected output:
```
BoxBoxNow
BoxBoxNowTests
BoxBoxNowUITests
```
(any subset including `BoxBoxNow`)

---

## Phase A — Shell + live data

Goal: an app that launches, logs in, and shows live race data. Modules: Race, Pit, Live, Adjusted, Adjusted-Beta, Config→Sessions.

### Task 1: Create the `BoxBoxNowDashboard` target

**Files:**
- Create: `scripts/xcode/create_dashboard_target.rb`
- Create: `scripts/xcode/add_file_to_target.rb`
- Modify: `BoxBoxNow/BoxBoxNow.xcodeproj/project.pbxproj` (via script)
- Create: `BoxBoxNow/BoxBoxNowDashboard/Info.plist`

- [ ] **Step 1: Write the target-creation script**

Create `scripts/xcode/create_dashboard_target.rb`:

```ruby
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
```

- [ ] **Step 2: Write the generic file-to-target helper**

Create `scripts/xcode/add_file_to_target.rb`:

```ruby
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
```

Make both scripts executable:
```bash
chmod +x scripts/xcode/create_dashboard_target.rb scripts/xcode/add_file_to_target.rb
```

- [ ] **Step 3: Create the Info.plist skeleton**

Create `BoxBoxNow/BoxBoxNowDashboard/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>UILaunchScreen</key>
    <dict/>
    <key>UIRequiredDeviceCapabilities</key>
    <array>
        <string>arm64</string>
    </array>
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UIApplicationSceneManifest</key>
    <dict>
        <key>UIApplicationSupportsMultipleScenes</key>
        <false/>
    </dict>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleTypeRole</key>
            <string>Editor</string>
            <key>CFBundleURLName</key>
            <string>com.jizcue.BoxBoxNowDashboard</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>boxboxnowdashboard</string>
            </array>
        </dict>
    </array>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
        <false/>
        <key>NSExceptionDomains</key>
        <dict>
            <key>localhost</key>
            <dict>
                <key>NSExceptionAllowsInsecureHTTPLoads</key>
                <true/>
            </dict>
        </dict>
    </dict>
</dict>
</plist>
```

- [ ] **Step 4: Create the entitlements file for shared Keychain Access Group**

Create `BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboard.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>keychain-access-groups</key>
    <array>
        <string>$(AppIdentifierPrefix)com.jizcue.BoxBoxNow.shared</string>
    </array>
</dict>
</plist>
```

Verify the existing driver app (`BoxBoxNow/BoxBoxNow.entitlements`) has the **same** access group; if it doesn't, add it there too so both apps read/write the same group.

- [ ] **Step 5: Run the creation script**

Run:
```bash
ruby scripts/xcode/create_dashboard_target.rb
```

Expected:
```
Created target BoxBoxNowDashboard + Tests + UITests in .../BoxBoxNow.xcodeproj
```

Sanity-check the project structure:
```bash
ruby -e "require 'xcodeproj'; puts Xcodeproj::Project.open('BoxBoxNow/BoxBoxNow.xcodeproj').targets.map(&:name)"
```
Expected: `BoxBoxNow`, `BoxBoxNowDashboard`, `BoxBoxNowDashboardTests`, `BoxBoxNowDashboardUITests`, plus any existing test targets.

- [ ] **Step 6: Commit**

```bash
git add scripts/xcode/ BoxBoxNow/BoxBoxNowDashboard/Info.plist BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboard.entitlements BoxBoxNow/BoxBoxNow.xcodeproj/project.pbxproj
git commit -m "feat(ipad): create BoxBoxNowDashboard target with entitlements"
```

---

### Task 2: Share existing Services/Models/Utilities with the dashboard target

**Files:**
- Modify: `BoxBoxNow/BoxBoxNow.xcodeproj/project.pbxproj` (via script)

Existing driver-app files that must become members of `BoxBoxNowDashboard` as well. They all stay unchanged — this step only adds an extra reference in the target's sources build phase.

- [ ] **Step 1: Write a one-shot sharing script**

Create `scripts/xcode/share_files_with_dashboard.rb`:

```ruby
#!/usr/bin/env ruby
# Adds the listed existing files to BoxBoxNowDashboard's sources build phase.
# Idempotent: if the file is already in the target, this is a no-op.
require 'xcodeproj'

PROJECT_PATH = File.expand_path('../../BoxBoxNow/BoxBoxNow.xcodeproj', __dir__)
TARGET_NAME  = 'BoxBoxNowDashboard'

SHARED = %w[
  BoxBoxNow/Services/APIClient.swift
  BoxBoxNow/Services/KeychainHelper.swift
  BoxBoxNow/Services/BiometricService.swift
  BoxBoxNow/Services/WebSocketClient.swift
  BoxBoxNow/Models/User.swift
  BoxBoxNow/Models/KartState.swift
  BoxBoxNow/Models/RaceConfig.swift
  BoxBoxNow/Models/Team.swift
  BoxBoxNow/Models/GPSSample.swift
  BoxBoxNow/Utilities/Constants.swift
  BoxBoxNow/Utilities/Formatters.swift
]

project = Xcodeproj::Project.open(PROJECT_PATH)
target  = project.targets.find { |t| t.name == TARGET_NAME } or abort "no target #{TARGET_NAME}"

added = []
skipped = []
SHARED.each do |rel|
  file_ref = project.files.find { |f| f.path && f.path.end_with?(rel.sub(%r{^BoxBoxNow/}, '')) }
  file_ref ||= project.files.find { |f| f.real_path.to_s.end_with?(rel) }
  abort "file_ref not found for #{rel}" unless file_ref

  if target.source_build_phase.files.any? { |bf| bf.file_ref == file_ref }
    skipped << rel
  else
    target.add_file_references([file_ref])
    added << rel
  end
end

project.save
puts "Added (#{added.size}):"; added.each { |p| puts "  + #{p}" }
puts "Already present (#{skipped.size}):"; skipped.each { |p| puts "  = #{p}" }
```

- [ ] **Step 2: Run the sharing script**

```bash
ruby scripts/xcode/share_files_with_dashboard.rb
```

Expected: 11 files either added or already present. No abort messages.

- [ ] **Step 3: Verify via xcodebuild that the target compiles**

Create a placeholder app entry to allow the target to build (we'll fully replace it in Task 14):

Create `BoxBoxNow/BoxBoxNowDashboard/App/BoxBoxNowDashboardApp.swift`:

```swift
import SwiftUI

@main
struct BoxBoxNowDashboardApp: App {
    var body: some Scene {
        WindowGroup {
            Text("BoxBoxNowDashboard — placeholder")
                .preferredColorScheme(.dark)
        }
    }
}
```

Register the file:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/App/BoxBoxNowDashboardApp.swift
```

- [ ] **Step 4: Build the target for the iPad simulator**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj \
           -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           -configuration Debug \
           build 2>&1 | tail -30
```

If the scheme doesn't exist yet (Xcode auto-creates schemes only the first time the project opens in IDE), generate it by:
```bash
ruby -e "
require 'xcodeproj'
p = Xcodeproj::Project.open('BoxBoxNow/BoxBoxNow.xcodeproj')
target = p.targets.find { |t| t.name == 'BoxBoxNowDashboard' }
Xcodeproj::XCScheme.share_scheme('BoxBoxNow/BoxBoxNow.xcodeproj', 'BoxBoxNowDashboard')
"
```

Expected build result: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add scripts/xcode/share_files_with_dashboard.rb \
        BoxBoxNow/BoxBoxNowDashboard/App/BoxBoxNowDashboardApp.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): share Services/Models/Utilities with dashboard target, minimal App shell"
```

---

### Task 3: Extend shared models with dashboard-required fields

**Files:**
- Modify: `BoxBoxNow/BoxBoxNow/Models/KartState.swift`
- Modify: `BoxBoxNow/BoxBoxNow/Models/RaceConfig.swift` (both `RaceConfig` and `Circuit`)
- Modify: `BoxBoxNow/BoxBoxNow/Models/User.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Models/SharedModelExtensionsTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/kart_state_extended.json`

- [ ] **Step 1: Write a failing test for `KartState` extended fields**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/kart_state_extended.json`:

```json
{
  "rowId": "k-1",
  "kartNumber": 1,
  "position": 3,
  "totalLaps": 42,
  "lastLapMs": 88345,
  "bestLapMs": 87120,
  "avgLapMs": 88500,
  "bestAvgMs": 88012,
  "bestStintLapMs": 87400,
  "gap": "+4.123",
  "interval": "+1.012",
  "pitCount": 2,
  "pitStatus": "racing",
  "tierScore": 88,
  "driverName": "Ayrton",
  "teamName": "Redline",
  "driverDifferentialMs": 320,
  "pitHistory": [
    {"pitNumber": 1, "lap": 18, "raceTimeMs": 1620000, "onTrackMs": 1580000, "driverName": "Ayrton", "totalDriverMs": 1580000, "pitTimeMs": 180000, "stintLaps": 18}
  ],
  "driverTotalMs": {"Ayrton": 3200000, "Niki": 1500000},
  "driverAvgLapMs": {"Ayrton": 88500, "Niki": 89100},
  "recentLaps": [
    {"lapTime": 88345, "totalLap": 42, "driverName": "Ayrton"},
    {"lapTime": 88012, "totalLap": 41, "driverName": "Ayrton"}
  ]
}
```

Create `BoxBoxNow/BoxBoxNowDashboardTests/Models/SharedModelExtensionsTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

final class SharedModelExtensionsTests: XCTestCase {
    func testKartStateDecodesExtendedFields() throws {
        let url = Bundle(for: type(of: self)).url(forResource: "kart_state_extended", withExtension: "json")!
        let data = try Data(contentsOf: url)
        let kart = try JSONDecoder().decode(KartState.self, from: data)

        XCTAssertEqual(kart.kartNumber, 1)
        XCTAssertEqual(kart.pitHistory?.count, 1)
        XCTAssertEqual(kart.pitHistory?.first?.pitNumber, 1)
        XCTAssertEqual(kart.driverTotalMs?["Ayrton"], 3200000)
        XCTAssertEqual(kart.driverAvgLapMs?["Ayrton"], 88500)
        XCTAssertEqual(kart.recentLaps?.count, 2)
        XCTAssertEqual(kart.recentLaps?.first?.lapTime, 88345)
    }

    func testRaceConfigDecodesExtendedFields() throws {
        let json = """
        {
          "circuitLengthM": 1200,
          "pitTimeS": 180,
          "ourKartNumber": 7,
          "minPits": 2,
          "maxStintMin": 35,
          "minStintMin": 5,
          "durationMin": 120,
          "boxLines": 2,
          "boxKarts": 4,
          "minDriverTimeMin": 60,
          "pitClosedStartMin": 5,
          "pitClosedEndMin": 5,
          "rain": false,
          "finishLat1": 40.1234,
          "finishLon1": -3.5678,
          "finishLat2": 40.1235,
          "finishLon2": -3.5679
        }
        """.data(using: .utf8)!
        let cfg = try JSONDecoder().decode(RaceConfig.self, from: json)
        XCTAssertEqual(cfg.boxLines, 2)
        XCTAssertEqual(cfg.pitClosedStartMin, 5)
        XCTAssertEqual(cfg.finishLat1, 40.1234, accuracy: 0.0001)
        XCTAssertEqual(cfg.finishLon2, -3.5679, accuracy: 0.0001)
    }

    func testCircuitDecodesExtendedFields() throws {
        let json = """
        {
          "id": 1, "name": "Jarama", "length_m": 1200,
          "finish_lat_1": 40.1234, "finish_lon_1": -3.5678,
          "finish_lat_2": 40.1235, "finish_lon_2": -3.5679,
          "is_active": true
        }
        """.data(using: .utf8)!
        let c = try JSONDecoder().decode(Circuit.self, from: json)
        XCTAssertEqual(c.lengthM, 1200)
        XCTAssertEqual(c.isActive, true)
        XCTAssertEqual(c.finishLat1, 40.1234, accuracy: 0.0001)
    }

    func testUserDecodesExtendedFields() throws {
        let json = """
        {
          "id": 42, "username": "ayrton", "email": "a@b.c",
          "is_admin": false, "mfa_enabled": true, "mfa_required": true,
          "tab_access": ["race","pit","live","config"],
          "has_active_subscription": true, "subscription_plan": "pro_annual",
          "subscription_status": "active", "created_at": "2026-01-01T00:00:00Z"
        }
        """.data(using: .utf8)!
        let u = try JSONDecoder().decode(User.self, from: json)
        XCTAssertEqual(u.subscriptionStatus, "active")
        XCTAssertNotNil(u.createdAt)
    }
}
```

- [ ] **Step 2: Add the fixture file to the test target**

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Fixtures/kart_state_extended.json
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Models/SharedModelExtensionsTests.swift
```

Mark the JSON file as a resource (not a source) via a second helper, or simply edit `project.pbxproj` to move it into the resources build phase. A small variant of the helper for resources:

Create `scripts/xcode/add_resource_to_target.rb`:

```ruby
#!/usr/bin/env ruby
require 'xcodeproj'
PROJECT_PATH = File.expand_path('../../BoxBoxNow/BoxBoxNow.xcodeproj', __dir__)
target_name = ARGV[0] or abort 'usage: add_resource_to_target.rb <target> <path>'
rel_path    = ARGV[1] or abort 'usage: add_resource_to_target.rb <target> <path>'
project = Xcodeproj::Project.open(PROJECT_PATH)
target  = project.targets.find { |t| t.name == target_name } or abort "no target #{target_name}"

parts = File.dirname(rel_path).split('/')
group = project.main_group
parts.each { |p| group = group.groups.find { |g| g.display_name == p } || group.new_group(p, p) }

filename = File.basename(rel_path)
file_ref = group.files.find { |f| f.display_name == filename } || group.new_reference(filename)
target.resources_build_phase.add_file_reference(file_ref, true) unless target.resources_build_phase.files.any? { |bf| bf.file_ref == file_ref }
project.save
puts "Resource #{rel_path} → #{target_name}"
```

```bash
chmod +x scripts/xcode/add_resource_to_target.rb
ruby scripts/xcode/add_resource_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Fixtures/kart_state_extended.json
```

- [ ] **Step 3: Run the test to verify it fails (Red)**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj \
           -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test 2>&1 | grep -E '(SharedModelExtensionsTests|FAILED|PASSED|error:)' | head -20
```

Expected: compile errors referencing `pitHistory`, `driverTotalMs`, `recentLaps`, `boxLines`, `finishLat1`, `subscriptionStatus`, `isActive`, `lengthM`, `createdAt` — these properties don't exist yet.

- [ ] **Step 4: Extend `KartState.swift` with the new fields**

Modify `BoxBoxNow/BoxBoxNow/Models/KartState.swift`:

Add these properties to the `struct` (after `driverDifferentialMs`):

```swift
    // --- Dashboard-only extensions (v1.1) ---
    var pitHistory: [PitRecord]?
    var driverTotalMs: [String: Double]?
    var driverAvgLapMs: [String: Double]?
    var recentLaps: [RecentLap]?

    struct RecentLap: Codable, Hashable {
        var lapTime: Double
        var totalLap: Int
        var driverName: String
    }
```

Extend the `CodingKeys` enum with the new cases:

```swift
    enum CodingKeys: String, CodingKey {
        case rowId, kartNumber, position, totalLaps
        case lastLapMs, bestLapMs, avgLapMs, bestAvgMs, bestStintLapMs
        case gap, interval
        case pitCount, pitStatus
        case stintLapsCount, stintDurationS, stintElapsedMs
        case stintStartCountdownMs, stintStartTime
        case tierScore
        case driverName, teamName
        case driverDifferentialMs
        case pitHistory, driverTotalMs, driverAvgLapMs, recentLaps
    }
```

(`PitRecord` is created in the dashboard target in Task 5 — add `import Foundation` only, we forward-declare via Swift module structure.)

**Forward reference:** `PitRecord` is defined in `BoxBoxNowDashboard/Models/PitRecord.swift` (Task 5) as a member of the dashboard target only. `KartState.swift` is a member of **both** targets, so we cannot reference `PitRecord` unconditionally (driver target would fail to compile). Solution: wrap the four dashboard-only properties in `#if canImport(...)` guards or — cleaner — move the property to an extension that lives **only** in the dashboard target.

Revise Step 4: put the extended properties in a **new file** visible only to the dashboard target, not in the shared `KartState.swift`.

Create `BoxBoxNow/BoxBoxNowDashboard/Models/KartState+Dashboard.swift`:

```swift
import Foundation

// Dashboard-only extensions to shared KartState.
// NOT added to the driver target (would fail: PitRecord is dashboard-only).
extension KartState {
    struct RecentLap: Codable, Hashable {
        var lapTime: Double
        var totalLap: Int
        var driverName: String
    }
}

// We cannot add stored properties to extensions in Swift. Instead we decode
// the dashboard-only fields into a side-struct and carry it as a runtime
// payload on KartState when needed. The dashboard never mutates KartState
// itself for these; it decodes a `KartStateFull` aggregate instead.

struct KartStateFull: Codable, Identifiable, Hashable {
    let base: KartState
    var pitHistory: [PitRecord]
    var driverTotalMs: [String: Double]
    var driverAvgLapMs: [String: Double]
    var recentLaps: [KartState.RecentLap]

    var id: String { base.id }

    init(from decoder: Decoder) throws {
        self.base = try KartState(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.pitHistory    = try c.decodeIfPresent([PitRecord].self, forKey: .pitHistory) ?? []
        self.driverTotalMs = try c.decodeIfPresent([String: Double].self, forKey: .driverTotalMs) ?? [:]
        self.driverAvgLapMs = try c.decodeIfPresent([String: Double].self, forKey: .driverAvgLapMs) ?? [:]
        self.recentLaps    = try c.decodeIfPresent([KartState.RecentLap].self, forKey: .recentLaps) ?? []
    }

    func encode(to encoder: Encoder) throws {
        try base.encode(to: encoder)
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(pitHistory, forKey: .pitHistory)
        try c.encode(driverTotalMs, forKey: .driverTotalMs)
        try c.encode(driverAvgLapMs, forKey: .driverAvgLapMs)
        try c.encode(recentLaps, forKey: .recentLaps)
    }

    private enum CodingKeys: String, CodingKey {
        case pitHistory, driverTotalMs, driverAvgLapMs, recentLaps
    }
}
```

Rewrite the `KartState` test to decode `KartStateFull`:

```swift
    func testKartStateDecodesExtendedFields() throws {
        let url = Bundle(for: type(of: self)).url(forResource: "kart_state_extended", withExtension: "json")!
        let data = try Data(contentsOf: url)
        let kart = try JSONDecoder().decode(KartStateFull.self, from: data)

        XCTAssertEqual(kart.base.kartNumber, 1)
        XCTAssertEqual(kart.pitHistory.count, 1)
        XCTAssertEqual(kart.pitHistory.first?.pitNumber, 1)
        XCTAssertEqual(kart.driverTotalMs["Ayrton"], 3200000)
        XCTAssertEqual(kart.driverAvgLapMs["Ayrton"], 88500)
        XCTAssertEqual(kart.recentLaps.count, 2)
        XCTAssertEqual(kart.recentLaps.first?.lapTime, 88345)
    }
```

Wire the new file to the dashboard target:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/Models/KartState+Dashboard.swift
```

(Don't worry about the `PitRecord` reference — we'll create that file in Task 5 before running tests.)

- [ ] **Step 5: Extend `RaceConfig.swift` with dashboard-only fields**

Since `RaceConfig` is shared, add the new fields as optional properties directly (no forward reference issues):

In `BoxBoxNow/BoxBoxNow/Models/RaceConfig.swift`, add a new top-level type (after `Circuit`):

```swift
// Dashboard-level race config (wider than driver's RaceSession).
// Decoded from the backend snapshot; driver doesn't need this.
struct RaceConfig: Codable, Hashable {
    var circuitLengthM: Double
    var pitTimeS: Double
    var ourKartNumber: Int
    var minPits: Int
    var maxStintMin: Int
    var minStintMin: Int
    var durationMin: Int
    var boxLines: Int
    var boxKarts: Int
    var minDriverTimeMin: Int
    var pitClosedStartMin: Int
    var pitClosedEndMin: Int
    var rain: Bool
    var finishLat1: Double?
    var finishLon1: Double?
    var finishLat2: Double?
    var finishLon2: Double?
}
```

There's a naming conflict with the driver app's `RaceConfig` (which doesn't exist as a type but `RaceSession` does — verify by grepping). If the driver already ships a `struct RaceConfig`, rename the dashboard type to `RaceConfigFull` and update all references accordingly. Confirm first:

```bash
grep -rn "struct RaceConfig " BoxBoxNow/BoxBoxNow/Models/ 2>&1
```

If empty output, proceed as-is; otherwise rename to `RaceConfigFull`.

- [ ] **Step 6: Extend `Circuit` with new fields**

Modify `BoxBoxNow/BoxBoxNow/Models/RaceConfig.swift` — in the `Circuit` struct, add:

```swift
struct Circuit: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let lengthM: Int?
    var finishLat1: Double?
    var finishLon1: Double?
    var finishLat2: Double?
    var finishLon2: Double?
    var isActive: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name
        case lengthM = "length_m"
        case finishLat1 = "finish_lat_1"
        case finishLon1 = "finish_lon_1"
        case finishLat2 = "finish_lat_2"
        case finishLon2 = "finish_lon_2"
        case isActive   = "is_active"
    }
}
```

- [ ] **Step 7: Extend `User` with the new fields**

Modify `BoxBoxNow/BoxBoxNow/Models/User.swift`:

```swift
struct User: Codable, Identifiable {
    let id: Int
    let username: String
    let email: String?
    let isAdmin: Bool
    let mfaEnabled: Bool?
    let mfaRequired: Bool?
    let tabAccess: [String]?
    let hasActiveSubscription: Bool?
    let subscriptionPlan: String?
    let subscriptionStatus: String?
    let createdAt: Date?

    var displayName: String { username }

    enum CodingKeys: String, CodingKey {
        case id, username, email
        case isAdmin = "is_admin"
        case mfaEnabled = "mfa_enabled"
        case mfaRequired = "mfa_required"
        case tabAccess = "tab_access"
        case hasActiveSubscription = "has_active_subscription"
        case subscriptionPlan = "subscription_plan"
        case subscriptionStatus = "subscription_status"
        case createdAt = "created_at"
    }
}
```

Backwards-compat check: driver app's existing `JSONDecoder()` usage must still parse `User` correctly since both new fields are optional. No change needed to driver code.

- [ ] **Step 8: Run the tests to verify they pass (Green)**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj \
           -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test 2>&1 | grep -E '(SharedModelExtensionsTests|Test Suite.*passed|Test Suite.*failed|error:)' | head -20
```

Expected: all 4 tests pass. If they fail because `PitRecord` is undefined, that's expected — those tests will become green once Task 5 creates `PitRecord.swift`. Mark them with `XCTSkipUnless(false)` temporarily or postpone running the `KartStateFull` test until Task 5.

Simpler approach: add `try XCTSkipIf(true, "Depends on PitRecord (Task 5)")` as the very first line of `testKartStateDecodesExtendedFields()` (before the `let json = ...` line) so the test returns early. Task 5 Step 5 removes that `XCTSkipIf` line and re-runs the suite to get the test green.

- [ ] **Step 9: Build the driver app to ensure we didn't break it**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj \
           -scheme BoxBoxNow \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -20
```

Expected: `** BUILD SUCCEEDED **`. If not, the extension broke driver decoding — verify that all added fields are optional.

- [ ] **Step 10: Commit**

```bash
git add BoxBoxNow/BoxBoxNow/Models/ \
        BoxBoxNow/BoxBoxNowDashboard/Models/KartState+Dashboard.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Models/SharedModelExtensionsTests.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/kart_state_extended.json \
        scripts/xcode/add_resource_to_target.rb \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): extend shared models with dashboard-only fields + fixture tests"
```

---

### Task 4: Design system foundations — colors, typography, core components

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/BBNColors.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/BBNTypography.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNCard.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNPrimaryButton.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNSecondaryButton.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNStatusDot.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNTierBadge.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNSection.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNNumericField.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNEmptyState.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNLoadingOverlay.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Design/Components/BBNToast.swift`

- [ ] **Step 1: Create `BBNColors.swift`**

```swift
import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xff) / 255
        let g = Double((hex >> 8)  & 0xff) / 255
        let b = Double(hex & 0xff) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }

    // Background layer (from tailwind.config.js)
    static let bbnBackground  = Color(hex: 0x000000)
    static let bbnSurface     = Color(hex: 0x111111)
    static let bbnCard        = Color(hex: 0x0a0a0a)
    static let bbnBorder      = Color(hex: 0x1a1a1a)

    // Accent
    static let bbnAccent      = Color(hex: 0x9fe556)
    static let bbnAccentHover = Color(hex: 0xb8f070)
    static let bbnAccentDim   = Color(hex: 0x9fe556).opacity(0.15)

    // Text
    static let bbnText        = Color.white
    static let bbnTextMuted   = Color(hex: 0xe5e5e5)
    static let bbnTextDim     = Color(hex: 0x808080)

    // Tier scale (leaderboard)
    static let bbnTier100 = Color(hex: 0x9fe556)
    static let bbnTier75  = Color(hex: 0xc8e946)
    static let bbnTier50  = Color(hex: 0xe5d43a)
    static let bbnTier25  = Color(hex: 0xe59a2e)
    static let bbnTier1   = Color(hex: 0xe54444)

    // Status
    static let bbnSuccess = Color(hex: 0x22c55e)
    static let bbnDanger  = Color(hex: 0xef4444)
    static let bbnWarning = Color(hex: 0xeab308)

    /// Map a tier score (0-100) to one of the 5 buckets.
    static func bbnTier(forScore score: Double) -> Color {
        switch score {
        case 88...: return .bbnTier100
        case 63..<88: return .bbnTier75
        case 38..<63: return .bbnTier50
        case 13..<38: return .bbnTier25
        default: return .bbnTier1
        }
    }
}
```

- [ ] **Step 2: Create `BBNTypography.swift`**

```swift
import SwiftUI

extension Font {
    static let bbnDisplay   = Font.system(size: 32, weight: .bold, design: .default)
    static let bbnTitle     = Font.system(size: 22, weight: .semibold, design: .default)
    static let bbnHeadline  = Font.system(size: 17, weight: .semibold, design: .default)
    static let bbnBody      = Font.system(size: 15, weight: .regular, design: .default)
    static let bbnCaption   = Font.system(size: 12, weight: .regular, design: .default)

    // Monospaced — for lap times, positions, kart numbers
    static let bbnMono       = Font.system(size: 15, weight: .regular, design: .monospaced)
    static let bbnMonoLarge  = Font.system(size: 24, weight: .semibold, design: .monospaced)
    static let bbnMonoHuge   = Font.system(size: 48, weight: .bold, design: .monospaced)
}
```

*Note:* We use SF Mono as a safe default. Loading Outfit + JetBrains Mono from TTF is deferred to a follow-up task once the shell is proven; SF Mono is visually indistinguishable for tabular numerics in v1.

- [ ] **Step 3: Create the core components**

Create `BBNCard.swift`:

```swift
import SwiftUI

struct BBNCard<Content: View>: View {
    let content: () -> Content
    init(@ViewBuilder _ content: @escaping () -> Content) { self.content = content }

    var body: some View {
        content()
            .padding(12)
            .background(Color.bbnCard)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.bbnBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

Create `BBNPrimaryButton.swift`:

```swift
import SwiftUI

struct BBNPrimaryButton: View {
    let title: String
    var icon: String? = nil
    var isLoading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().tint(.black)
                } else if let icon {
                    Image(systemName: icon)
                }
                Text(title).font(.bbnHeadline.weight(.semibold))
            }
            .foregroundColor(.black)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.bbnAccent)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(isLoading)
    }
}
```

Create `BBNSecondaryButton.swift`:

```swift
import SwiftUI

struct BBNSecondaryButton: View {
    let title: String
    var icon: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon) }
                Text(title).font(.bbnHeadline.weight(.medium))
            }
            .foregroundColor(.bbnText)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.bbnSurface)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.bbnBorder, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}
```

Create `BBNStatusDot.swift`:

```swift
import SwiftUI

struct BBNStatusDot: View {
    let isOn: Bool
    let label: String
    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(isOn ? Color.bbnSuccess : Color.bbnDanger)
                .frame(width: 8, height: 8)
                .scaleEffect(isOn ? 1 : (pulse ? 1.2 : 0.9))
                .animation(isOn ? .default : .easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: pulse)
            Text(label).font(.bbnCaption).foregroundColor(.bbnTextMuted)
        }
        .onAppear { pulse = true }
    }
}
```

Create `BBNTierBadge.swift`:

```swift
import SwiftUI

struct BBNTierBadge: View {
    let score: Double?

    var body: some View {
        Text(score.map { String(Int($0)) } ?? "—")
            .font(.bbnMono.weight(.semibold))
            .foregroundColor(color)
            .padding(.horizontal, 8).padding(.vertical, 2)
            .background(color.opacity(0.15))
            .clipShape(Capsule())
    }

    private var color: Color { Color.bbnTier(forScore: score ?? 0) }
}
```

Create `BBNSection.swift`:

```swift
import SwiftUI

struct BBNSection<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    let content: () -> Content

    init(_ title: String, subtitle: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.bbnTitle).foregroundColor(.bbnText)
                    if let subtitle {
                        Text(subtitle).font(.bbnCaption).foregroundColor(.bbnTextMuted)
                    }
                }
                Spacer()
            }
            content()
        }
        .padding(.vertical, 16)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.bbnBorder).frame(height: 1)
        }
    }
}
```

Create `BBNNumericField.swift`:

```swift
import SwiftUI

struct BBNNumericField: View {
    let label: String
    @Binding var value: Double
    var step: Double = 1
    var formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.maximumFractionDigits = 2
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "es_ES")
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.bbnCaption).foregroundColor(.bbnTextMuted)
            TextField("", value: $value, formatter: formatter)
                .keyboardType(.decimalPad)
                .font(.bbnMono)
                .foregroundColor(.bbnText)
                .padding(8)
                .background(Color.bbnSurface)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.bbnBorder, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
}
```

Create `BBNEmptyState.swift`:

```swift
import SwiftUI

struct BBNEmptyState: View {
    let icon: String
    let title: String
    var subtitle: String? = nil
    var action: (title: String, handler: () -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 48)).foregroundColor(.bbnTextDim)
            Text(title).font(.bbnTitle).foregroundColor(.bbnText)
            if let subtitle {
                Text(subtitle).font(.bbnBody).foregroundColor(.bbnTextMuted).multilineTextAlignment(.center)
            }
            if let action {
                BBNPrimaryButton(title: action.title, action: action.handler).frame(maxWidth: 240)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(40)
    }
}
```

Create `BBNLoadingOverlay.swift`:

```swift
import SwiftUI

struct BBNLoadingOverlay: View {
    let isVisible: Bool
    var message: String? = nil

    var body: some View {
        if isVisible {
            ZStack {
                Color.black.opacity(0.5).ignoresSafeArea()
                VStack(spacing: 12) {
                    ProgressView().tint(.bbnAccent).scaleEffect(1.5)
                    if let message { Text(message).font(.bbnBody).foregroundColor(.bbnTextMuted) }
                }
                .padding(32)
                .background(Color.bbnCard)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.bbnBorder, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .transition(.opacity)
        }
    }
}
```

Create `BBNToast.swift`:

```swift
import SwiftUI

struct BBNToast: View {
    enum Kind { case info, success, error
        var color: Color { switch self { case .info: return .bbnAccent; case .success: return .bbnSuccess; case .error: return .bbnDanger } }
        var icon: String { switch self { case .info: return "info.circle"; case .success: return "checkmark.circle"; case .error: return "xmark.circle" } }
    }
    let kind: Kind
    let message: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: kind.icon).foregroundColor(kind.color)
            Text(message).font(.bbnBody).foregroundColor(.bbnText)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color.bbnCard)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(kind.color, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.5), radius: 8, x: 0, y: 4)
    }
}
```

- [ ] **Step 4: Add all 11 files to the target**

```bash
for f in BoxBoxNowDashboard/Design/BBNColors.swift \
         BoxBoxNowDashboard/Design/BBNTypography.swift \
         BoxBoxNowDashboard/Design/Components/BBNCard.swift \
         BoxBoxNowDashboard/Design/Components/BBNPrimaryButton.swift \
         BoxBoxNowDashboard/Design/Components/BBNSecondaryButton.swift \
         BoxBoxNowDashboard/Design/Components/BBNStatusDot.swift \
         BoxBoxNowDashboard/Design/Components/BBNTierBadge.swift \
         BoxBoxNowDashboard/Design/Components/BBNSection.swift \
         BoxBoxNowDashboard/Design/Components/BBNNumericField.swift \
         BoxBoxNowDashboard/Design/Components/BBNEmptyState.swift \
         BoxBoxNowDashboard/Design/Components/BBNLoadingOverlay.swift \
         BoxBoxNowDashboard/Design/Components/BBNToast.swift; do
  ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "$f"
done
```

- [ ] **Step 5: Build to verify all components compile**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj \
           -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 6: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Design/ BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): design system foundations (colors, typography, 11 base components)"
```

---

### Task 5: Dashboard-only models (JSONValue, PitRecord, Fifo, Classification, Snapshot, Ws)

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/JSONValue.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/PitRecord.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/FifoEntry.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/FifoState.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/FifoSnapshot.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/ClassificationEntry.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/RaceSnapshot.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/WsMessage.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/WsUpdateEvent.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/ReplayStatus.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/DeviceSession.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Models/JSONValueTests.swift`

- [ ] **Step 1: Write the failing `JSONValue` tests**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Models/JSONValueTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

final class JSONValueTests: XCTestCase {
    func testDecodesPrimitives() throws {
        let json = #"{"s":"hi","i":42,"d":3.14,"b":true,"n":null}"#.data(using: .utf8)!
        let v = try JSONDecoder().decode([String: JSONValue].self, from: json)
        XCTAssertEqual(v["s"], .string("hi"))
        XCTAssertEqual(v["i"], .int(42))
        XCTAssertEqual(v["d"], .double(3.14))
        XCTAssertEqual(v["b"], .bool(true))
        XCTAssertEqual(v["n"], .null)
    }

    func testDecodesNestedArrayAndObject() throws {
        let json = #"{"arr":[1,"x",true],"obj":{"k":"v"}}"#.data(using: .utf8)!
        let v = try JSONDecoder().decode([String: JSONValue].self, from: json)
        if case let .array(items) = v["arr"] {
            XCTAssertEqual(items, [.int(1), .string("x"), .bool(true)])
        } else { XCTFail("expected array") }

        if case let .object(dict) = v["obj"] {
            XCTAssertEqual(dict["k"], .string("v"))
        } else { XCTFail("expected object") }
    }

    func testEncodesRoundTrip() throws {
        let original: JSONValue = .object([
            "x": .int(1),
            "y": .array([.bool(false), .string("z")])
        ])
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testSubscripts() {
        let v: JSONValue = .object(["a": .object(["b": .int(7)])])
        XCTAssertEqual(v["a"]?["b"], .int(7))
        XCTAssertNil(v["missing"])
    }
}
```

Wire the file:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Models/JSONValueTests.swift
```

Run to see the Red state: compile fails, `JSONValue` is undefined.

- [ ] **Step 2: Implement `JSONValue`**

Create `BoxBoxNow/BoxBoxNowDashboard/Models/JSONValue.swift`:

```swift
import Foundation

/// Flexible JSON value for payloads whose shape varies per subtype (e.g. WS update events).
/// Decodes any JSON scalar, array, or object into a strongly-typed enum without dropping data.
enum JSONValue: Codable, Equatable, Hashable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let i = try? c.decode(Int.self) { self = .int(i); return }
        if let d = try? c.decode(Double.self) { self = .double(d); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unknown JSON value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .int(let i): try c.encode(i)
        case .double(let d): try c.encode(d)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    subscript(key: String) -> JSONValue? {
        if case let .object(dict) = self { return dict[key] }
        return nil
    }

    subscript(index: Int) -> JSONValue? {
        if case let .array(arr) = self, arr.indices.contains(index) { return arr[index] }
        return nil
    }

    var stringValue: String? { if case let .string(s) = self { return s } else { return nil } }
    var intValue: Int? {
        switch self { case let .int(i): return i; case let .double(d): return Int(d); default: return nil }
    }
    var doubleValue: Double? {
        switch self { case let .double(d): return d; case let .int(i): return Double(i); default: return nil }
    }
    var boolValue: Bool? { if case let .bool(b) = self { return b } else { return nil } }
}
```

Wire and run:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/Models/JSONValue.swift
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/JSONValueTests 2>&1 | tail -15
```

Expected: 4 passing tests.

- [ ] **Step 3: Implement the race models**

Create `BoxBoxNow/BoxBoxNowDashboard/Models/PitRecord.swift`:

```swift
import Foundation

struct PitRecord: Codable, Hashable, Identifiable {
    var pitNumber: Int
    var lap: Int
    var raceTimeMs: Double
    var onTrackMs: Double
    var driverName: String
    var totalDriverMs: Double
    var pitTimeMs: Double
    var stintLaps: Int

    var id: Int { pitNumber }
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/FifoEntry.swift`:

```swift
import Foundation

struct FifoEntry: Codable, Hashable, Identifiable {
    var score: Double
    var kartNumber: Int
    var teamName: String
    var driverName: String
    var avgLapMs: Double?
    var avgPosition: Double?
    var recentLaps: [KartState.RecentLap]?
    var pitCount: Int?
    var stintLaps: Int?
    var line: Int?

    var id: Int { kartNumber }
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/FifoState.swift`:

```swift
import Foundation

struct FifoState: Codable, Hashable {
    var queue: [FifoEntry]
    var score: Double
    var history: [FifoSnapshot]

    static let empty = FifoState(queue: [], score: 0, history: [])
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/FifoSnapshot.swift`:

```swift
import Foundation

struct FifoSnapshot: Codable, Hashable {
    var timestamp: Double
    var queue: [FifoEntry]
    var score: Double
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/ClassificationEntry.swift`:

```swift
import Foundation

struct ClassificationEntry: Codable, Hashable, Identifiable {
    var position: Int
    var kartNumber: Int
    var teamName: String
    var driverName: String
    var totalLaps: Int
    var pitCount: Int
    var gap: String
    var interval: String
    var avgLapMs: Double
    var tierScore: Double

    var id: Int { kartNumber }
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/RaceSnapshot.swift`:

```swift
import Foundation

struct RaceSnapshot: Codable, Hashable {
    var raceStarted: Bool
    var raceFinished: Bool?
    var countdownMs: Double
    var trackName: String
    var karts: [KartStateFull]
    var fifo: FifoState
    var classification: [ClassificationEntry]
    var config: RaceConfig
    var durationMs: Double
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/WsUpdateEvent.swift`:

```swift
import Foundation

struct WsUpdateEvent: Codable, Hashable {
    var event: String
    var rowId: String?
    var kartNumber: Int?
    var extra: [String: JSONValue]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: AnyCodingKey.self)
        self.event = try container.decode(String.self, forKey: AnyCodingKey("event"))
        self.rowId = try container.decodeIfPresent(String.self, forKey: AnyCodingKey("rowId"))
        self.kartNumber = try container.decodeIfPresent(Int.self, forKey: AnyCodingKey("kartNumber"))

        var extra: [String: JSONValue] = [:]
        for key in container.allKeys where !["event", "rowId", "kartNumber"].contains(key.stringValue) {
            extra[key.stringValue] = try container.decode(JSONValue.self, forKey: key)
        }
        self.extra = extra
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: AnyCodingKey.self)
        try container.encode(event, forKey: AnyCodingKey("event"))
        try container.encodeIfPresent(rowId, forKey: AnyCodingKey("rowId"))
        try container.encodeIfPresent(kartNumber, forKey: AnyCodingKey("kartNumber"))
        for (k, v) in extra {
            try container.encode(v, forKey: AnyCodingKey(k))
        }
    }
}

private struct AnyCodingKey: CodingKey {
    var stringValue: String
    init(_ s: String) { self.stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    var intValue: Int? { nil }
    init?(intValue: Int) { return nil }
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/WsMessage.swift`:

```swift
import Foundation

enum WsMessageType: String, Codable {
    case snapshot
    case update
    case analytics
    case fifoUpdate = "fifo_update"
    case replayStatus = "replay_status"
    case teamsUpdated = "teams_updated"
    case boxCall = "box_call"
}

struct WsMessage: Codable {
    let type: WsMessageType
    let data: WsMessageData?
    let events: [WsUpdateEvent]?
}

/// Union of possible `data` payloads. Only one of these is typically non-nil
/// per WS message. Decoded leniently so unknown fields don't throw.
struct WsMessageData: Codable {
    var raceStarted: Bool?
    var raceFinished: Bool?
    var countdownMs: Double?
    var trackName: String?
    var karts: [KartStateFull]?
    var fifo: FifoState?
    var classification: [ClassificationEntry]?
    var config: RaceConfig?
    var durationMs: Double?
    var teams: [Team]?
    var replayStatus: ReplayStatus?
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/ReplayStatus.swift`:

```swift
import Foundation

struct ReplayStatus: Codable, Hashable {
    var active: Bool
    var filename: String?
    var progress: Double
    var speed: Double
    var paused: Bool

    static let idle = ReplayStatus(active: false, filename: nil, progress: 0, speed: 1, paused: false)
}
```

Create `BoxBoxNow/BoxBoxNowDashboard/Models/DeviceSession.swift`:

```swift
import Foundation

struct DeviceSession: Codable, Hashable, Identifiable {
    let id: Int
    let deviceName: String
    let ipAddress: String?
    let userAgent: String?
    let createdAt: Date?
    let lastSeenAt: Date?
    let isCurrent: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case deviceName = "device_name"
        case ipAddress  = "ip_address"
        case userAgent  = "user_agent"
        case createdAt  = "created_at"
        case lastSeenAt = "last_seen_at"
        case isCurrent  = "is_current"
    }
}
```

- [ ] **Step 4: Wire all new model files to the dashboard target**

```bash
for f in PitRecord FifoEntry FifoState FifoSnapshot ClassificationEntry RaceSnapshot WsUpdateEvent WsMessage ReplayStatus DeviceSession; do
  ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/Models/${f}.swift"
done
```

- [ ] **Step 5: Un-skip the `KartStateFull` test from Task 3**

Remove the `XCTSkipIf(true, ...)` line in `SharedModelExtensionsTests.testKartStateDecodesExtendedFields` now that `PitRecord` exists.

- [ ] **Step 6: Build + run all tests**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test 2>&1 | grep -E '(Test Suite|passed|failed|error:)' | head -20
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Models/ \
        BoxBoxNow/BoxBoxNowDashboardTests/Models/JSONValueTests.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): add JSONValue + race/fifo/classification/snapshot/ws models"
```

---

### Task 6: Fixture-based decoding tests for the full snapshot + updates

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/snapshot.json`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/update.json`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/fifo_update.json`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/replay_status.json`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/FixtureLoader.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Models/DecodeFixturesTests.swift`

- [ ] **Step 1: Write the minimal snapshot fixture by hand**

(Cover realistic fields; once the dev backend is up, replace with real recorded JSON.)

Create `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/snapshot.json`:

```json
{
  "type": "snapshot",
  "data": {
    "raceStarted": true,
    "raceFinished": false,
    "countdownMs": 0,
    "trackName": "Jarama",
    "durationMs": 7200000,
    "config": {
      "circuitLengthM": 1200,
      "pitTimeS": 180,
      "ourKartNumber": 7,
      "minPits": 2,
      "maxStintMin": 35,
      "minStintMin": 5,
      "durationMin": 120,
      "boxLines": 2,
      "boxKarts": 4,
      "minDriverTimeMin": 60,
      "pitClosedStartMin": 5,
      "pitClosedEndMin": 5,
      "rain": false
    },
    "karts": [
      {
        "rowId": "k-1", "kartNumber": 1, "position": 1, "totalLaps": 50,
        "lastLapMs": 88000, "bestLapMs": 87500, "avgLapMs": 88100, "bestAvgMs": 87800, "bestStintLapMs": 87600,
        "gap": "—", "interval": "—", "pitCount": 2, "pitStatus": "racing",
        "tierScore": 92, "driverName": "Alice", "teamName": "Alpha",
        "pitHistory": [], "driverTotalMs": {"Alice": 4400000}, "driverAvgLapMs": {"Alice": 88100}, "recentLaps": []
      },
      {
        "rowId": "k-7", "kartNumber": 7, "position": 3, "totalLaps": 49,
        "lastLapMs": 89000, "bestLapMs": 88200, "avgLapMs": 89200, "bestAvgMs": 88900, "bestStintLapMs": 88100,
        "gap": "+4.123", "interval": "+2.010", "pitCount": 2, "pitStatus": "racing",
        "tierScore": 72, "driverName": "Bob", "teamName": "Our Team",
        "pitHistory": [], "driverTotalMs": {"Bob": 4300000}, "driverAvgLapMs": {"Bob": 89200}, "recentLaps": []
      }
    ],
    "fifo": {
      "queue": [
        {"score": 85, "kartNumber": 1, "teamName": "Alpha", "driverName": "Alice", "line": 1}
      ],
      "score": 85,
      "history": []
    },
    "classification": [
      {"position": 1, "kartNumber": 1, "teamName": "Alpha", "driverName": "Alice", "totalLaps": 50, "pitCount": 2, "gap": "—", "interval": "—", "avgLapMs": 88100, "tierScore": 92}
    ]
  }
}
```

Create `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/update.json`:

```json
{
  "type": "update",
  "events": [
    {"event": "lap_completed", "rowId": "k-1", "kartNumber": 1, "lapMs": 88000, "totalLaps": 51},
    {"event": "pit_entered", "rowId": "k-7", "kartNumber": 7, "raceTimeMs": 4500000}
  ]
}
```

Create `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/fifo_update.json`:

```json
{
  "type": "fifo_update",
  "data": {
    "fifo": {
      "queue": [
        {"score": 90, "kartNumber": 7, "teamName": "Our Team", "driverName": "Bob", "line": 1}
      ],
      "score": 90,
      "history": []
    }
  }
}
```

Create `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/replay_status.json`:

```json
{
  "type": "replay_status",
  "data": {
    "replayStatus": {
      "active": true,
      "filename": "jarama_2026_03_15.jsonl",
      "progress": 0.45,
      "speed": 2,
      "paused": false
    }
  }
}
```

Wire all as resources:
```bash
for f in snapshot update fifo_update replay_status; do
  ruby scripts/xcode/add_resource_to_target.rb BoxBoxNowDashboardTests "BoxBoxNowDashboardTests/Fixtures/${f}.json"
done
```

- [ ] **Step 2: Create the fixture loader helper**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/FixtureLoader.swift`:

```swift
import Foundation
import XCTest

enum FixtureLoader {
    static func load(_ name: String, ext: String = "json", in cls: AnyClass) throws -> Data {
        guard let url = Bundle(for: cls).url(forResource: name, withExtension: ext) else {
            throw NSError(domain: "FixtureLoader", code: 404, userInfo: [NSLocalizedDescriptionKey: "Missing fixture \(name).\(ext)"])
        }
        return try Data(contentsOf: url)
    }

    static func decode<T: Decodable>(_ type: T.Type, from name: String, in cls: AnyClass) throws -> T {
        let data = try load(name, in: cls)
        return try JSONDecoder().decode(T.self, from: data)
    }
}
```

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Helpers/FixtureLoader.swift
```

- [ ] **Step 3: Write the decoding tests**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Models/DecodeFixturesTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

final class DecodeFixturesTests: XCTestCase {
    func testDecodesSnapshot() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        XCTAssertEqual(msg.type, .snapshot)
        XCTAssertEqual(msg.data?.trackName, "Jarama")
        XCTAssertEqual(msg.data?.karts?.count, 2)
        XCTAssertEqual(msg.data?.karts?.first?.base.kartNumber, 1)
        XCTAssertEqual(msg.data?.config?.boxLines, 2)
        XCTAssertEqual(msg.data?.fifo?.queue.count, 1)
        XCTAssertEqual(msg.data?.classification?.count, 1)
    }

    func testDecodesUpdateEventsWithExtra() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "update", in: Self.self)
        XCTAssertEqual(msg.type, .update)
        XCTAssertEqual(msg.events?.count, 2)
        let lap = msg.events?[0]
        XCTAssertEqual(lap?.event, "lap_completed")
        XCTAssertEqual(lap?.kartNumber, 1)
        XCTAssertEqual(lap?.extra["lapMs"], .int(88000))
        XCTAssertEqual(lap?.extra["totalLaps"], .int(51))
    }

    func testDecodesFifoUpdate() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "fifo_update", in: Self.self)
        XCTAssertEqual(msg.type, .fifoUpdate)
        XCTAssertEqual(msg.data?.fifo?.queue.first?.kartNumber, 7)
    }

    func testDecodesReplayStatus() throws {
        let msg = try FixtureLoader.decode(WsMessage.self, from: "replay_status", in: Self.self)
        XCTAssertEqual(msg.type, .replayStatus)
        XCTAssertEqual(msg.data?.replayStatus?.speed, 2)
        XCTAssertEqual(msg.data?.replayStatus?.progress ?? 0, 0.45, accuracy: 0.001)
    }
}
```

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Models/DecodeFixturesTests.swift
```

- [ ] **Step 4: Run tests — expect green**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/DecodeFixturesTests 2>&1 | tail -10
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/ \
        BoxBoxNow/BoxBoxNowDashboardTests/Helpers/ \
        BoxBoxNow/BoxBoxNowDashboardTests/Models/DecodeFixturesTests.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "test(ipad): fixture-based decoding tests for snapshot/update/fifo/replay"
```

---

### Task 7: `APIClient+Dashboard` extensions (generic get/post/patch/delete with query + 401 notification)

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/APIClient+Dashboard.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Services/APIClientDashboardTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockURLProtocol.swift`

- [ ] **Step 1: Write a minimal URL-protocol stub for REST mocking**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockURLProtocol.swift`:

```swift
import Foundation

final class MockURLProtocol: URLProtocol {
    /// (statusCode, body, optional delay) — set per test
    static var handler: ((URLRequest) throws -> (Int, Data, HTTPURLResponse?))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: "MockURLProtocol", code: 0))
            return
        }
        do {
            let (status, data, customResponse) = try handler(request)
            let response = customResponse ?? HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    static func sessionConfiguration() -> URLSessionConfiguration {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return config
    }
}
```

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Helpers/MockURLProtocol.swift
```

- [ ] **Step 2: Write the failing APIClient+Dashboard tests**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Services/APIClientDashboardTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

struct Echo: Codable, Equatable { let ok: Bool; let n: Int }

final class APIClientDashboardTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockURLProtocol.handler = nil
        APIClient.shared.overrideURLSession = URLSession(configuration: MockURLProtocol.sessionConfiguration())
    }

    override func tearDown() {
        APIClient.shared.overrideURLSession = nil
        super.tearDown()
    }

    func testGetWithQuery() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.url?.path, "/api/race/snapshot")
            XCTAssertEqual(req.url?.query, "view=full")
            XCTAssertEqual(req.httpMethod, "GET")
            let body = try JSONEncoder().encode(Echo(ok: true, n: 1))
            return (200, body, nil)
        }
        let e: Echo = try await APIClient.shared.getJSON("/race/snapshot", query: [URLQueryItem(name: "view", value: "full")])
        XCTAssertEqual(e, Echo(ok: true, n: 1))
    }

    func testPostJSONEncodable() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.httpMethod, "POST")
            XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/json")
            let body = try JSONEncoder().encode(Echo(ok: true, n: 42))
            return (200, body, nil)
        }
        let reply: Echo = try await APIClient.shared.postJSON("/race/reset", body: Echo(ok: true, n: 0))
        XCTAssertEqual(reply.n, 42)
    }

    func testPatchJSONEncodable() async throws {
        MockURLProtocol.handler = { _ in (200, try JSONEncoder().encode(Echo(ok: true, n: 9)), nil) }
        let reply: Echo = try await APIClient.shared.patchJSON("/config/preferences", body: Echo(ok: true, n: 0))
        XCTAssertEqual(reply.n, 9)
    }

    func testDelete() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.httpMethod, "DELETE")
            return (204, Data(), nil)
        }
        try await APIClient.shared.deleteJSON("/auth/sessions/42")
    }

    func testUnauthorizedFires401Notification() async {
        MockURLProtocol.handler = { _ in (401, Data(), nil) }
        let exp = expectation(forNotification: .authExpired, object: nil)
        do {
            let _: Echo = try await APIClient.shared.getJSON("/auth/me")
            XCTFail("expected throw")
        } catch { /* ok */ }
        await fulfillment(of: [exp], timeout: 1)
    }
}
```

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Services/APIClientDashboardTests.swift
```

- [ ] **Step 3: Implement `APIClient+Dashboard`**

Create `BoxBoxNow/BoxBoxNowDashboard/Services/APIClient+Dashboard.swift`:

```swift
import Foundation

// Dashboard-only additive surface on the shared APIClient.
// None of these methods overlap with the existing driver-app methods —
// they use distinct generic signatures that encode with JSONEncoder
// instead of dict-based JSONSerialization.

public extension Notification.Name {
    static let authExpired = Notification.Name("BBNAuthExpired")
}

extension APIClient {
    /// Injectable for tests. When non-nil, all dashboard requests use this session.
    var overrideURLSession: URLSession? {
        get { objc_getAssociatedObject(self, &overrideSessionKey) as? URLSession }
        set { objc_setAssociatedObject(self, &overrideSessionKey, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }

    private static let jsonEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let jsonDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private var effectiveSession: URLSession { overrideURLSession ?? URLSession.shared }

    // --- Generic REST surface ---

    func getJSON<T: Decodable>(_ path: String, query: [URLQueryItem]? = nil) async throws -> T {
        let req = try buildDashboardRequest(path, method: "GET", query: query, body: nil)
        return try await executeJSON(req)
    }

    func postJSON<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        let data = try Self.jsonEncoder.encode(body)
        let req = try buildDashboardRequest(path, method: "POST", query: nil, body: data)
        return try await executeJSON(req)
    }

    func patchJSON<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        let data = try Self.jsonEncoder.encode(body)
        let req = try buildDashboardRequest(path, method: "PATCH", query: nil, body: data)
        return try await executeJSON(req)
    }

    func deleteJSON(_ path: String) async throws {
        let req = try buildDashboardRequest(path, method: "DELETE", query: nil, body: nil)
        let (_, response) = try await effectiveSession.data(for: req)
        try handleStatus(response)
    }

    // --- Internals ---

    private func buildDashboardRequest(_ path: String, method: String, query: [URLQueryItem]?, body: Data?) throws -> URLRequest {
        var components = URLComponents(string: Constants.apiBaseURL + path)
        if let query { components?.queryItems = query }
        guard let url = components?.url else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if let token = KeychainHelper.loadToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = body
        }
        return req
    }

    private func executeJSON<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await effectiveSession.data(for: req)
        try handleStatus(response)
        return try Self.jsonDecoder.decode(T.self, from: data)
    }

    private func handleStatus(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
        if http.statusCode == 401 {
            KeychainHelper.deleteToken()
            NotificationCenter.default.post(name: .authExpired, object: nil)
            throw APIError.unauthorized
        }
        guard (200...299).contains(http.statusCode) else { throw APIError.requestFailed }
    }
}

private var overrideSessionKey: UInt8 = 0
```

Wire it:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/Services/APIClient+Dashboard.swift
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/APIClientDashboardTests 2>&1 | tail -20
```

Expected: 5 passing tests.

- [ ] **Step 5: Verify the driver app still compiles (no accidental overlap)**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNow \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 6: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Services/APIClient+Dashboard.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Services/APIClientDashboardTests.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockURLProtocol.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): APIClient dashboard extensions + 401 notification + tests"
```

---

### Task 8: Thin Services (Auth, Race, Config REST, Admin, Public)

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/AuthService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/RaceService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/AdminService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/PublicService.swift`

Each service is a thin wrapper that converts backend JSON into Swift types. No business logic (that lives in the stores).

- [ ] **Step 1: `AuthService`**

```swift
import Foundation

struct LoginResponse: Codable {
    let accessToken: String
    let user: User
    let mfaRequired: Bool
    let mfaEnabled: Bool
    let mfaSecret: String?

    enum CodingKeys: String, CodingKey {
        case user
        case accessToken = "access_token"
        case mfaRequired = "mfa_required"
        case mfaEnabled  = "mfa_enabled"
        case mfaSecret   = "mfa_secret"
    }
}

struct MFAVerifyRequest: Codable { let mfaCode: String; enum CodingKeys: String, CodingKey { case mfaCode = "mfa_code" } }
struct LoginRequest: Codable { let username: String; let password: String }
struct EmptyBody: Codable {}

struct AuthService {
    let api = APIClient.shared

    func login(email: String, password: String) async throws -> LoginResponse {
        try await api.postJSON("/auth/login", body: LoginRequest(username: email, password: password))
    }
    func verifyMFA(code: String) async throws -> LoginResponse {
        try await api.postJSON("/auth/mfa/verify", body: MFAVerifyRequest(mfaCode: code))
    }
    func me() async throws -> User {
        try await api.getJSON("/auth/me")
    }
    func logout() async throws {
        let _: EmptyBody = try await api.postJSON("/auth/logout", body: EmptyBody())
    }
    func sessions() async throws -> [DeviceSession] {
        try await api.getJSON("/auth/sessions")
    }
    func deleteSession(id: Int) async throws {
        try await api.deleteJSON("/auth/sessions/\(id)")
    }
}
```

- [ ] **Step 2: `RaceService`**

```swift
import Foundation

struct RaceService {
    let api = APIClient.shared

    func snapshot() async throws -> RaceSnapshot {
        try await api.getJSON("/race/snapshot")
    }
    func config() async throws -> RaceConfig {
        try await api.getJSON("/race/config")
    }
    func updateConfig(_ cfg: RaceConfig) async throws -> RaceConfig {
        try await api.patchJSON("/race/config", body: cfg)
    }
    func resetRace() async throws {
        let _: EmptyBody = try await api.postJSON("/race/reset", body: EmptyBody())
    }
    func teams() async throws -> [Team] {
        try await api.getJSON("/race/teams")
    }
    func updateTeam(_ team: Team) async throws -> Team {
        try await api.patchJSON("/race/teams/\(team.id ?? 0)", body: team)
    }
}
```

- [ ] **Step 3: `ConfigService`**

```swift
import Foundation

struct LiveTimingURLResponse: Codable { let url: String }

struct ConfigService {
    let api = APIClient.shared

    func liveTimingURL() async throws -> String {
        let r: LiveTimingURLResponse = try await api.getJSON("/config/live-timing-url")
        return r.url
    }
    func circuits() async throws -> [Circuit] {
        try await api.getJSON("/config/circuits")
    }
    func selectCircuit(id: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/config/circuits/\(id)/select", body: EmptyBody())
    }
    func preferences() async throws -> DriverPreferences {
        try await api.getJSON("/config/preferences")
    }
    func updatePreferences(_ prefs: DriverPreferences) async throws -> DriverPreferences {
        try await api.patchJSON("/config/preferences", body: prefs)
    }
    func presets() async throws -> [DriverConfigPreset] {
        try await api.getJSON("/config/presets")
    }
    func createPreset(_ preset: DriverConfigPreset) async throws -> DriverConfigPreset {
        try await api.postJSON("/config/presets", body: preset)
    }
    func updatePreset(_ preset: DriverConfigPreset) async throws -> DriverConfigPreset {
        try await api.patchJSON("/config/presets/\(preset.id)", body: preset)
    }
    func deletePreset(id: Int) async throws {
        try await api.deleteJSON("/config/presets/\(id)")
    }
}
```

- [ ] **Step 4: `AdminService` + `PublicService` (stubs with signatures only; bodies filled in Phase D)**

`AdminService.swift`:

```swift
import Foundation

struct AdminService {
    let api = APIClient.shared

    func listUsers() async throws -> [UserListItem] {
        try await api.getJSON("/admin/users")
    }
    func updateUser(id: Int, fields: [String: JSONValue]) async throws -> UserListItem {
        try await api.patchJSON("/admin/users/\(id)", body: fields)
    }
    func deleteUser(id: Int) async throws {
        try await api.deleteJSON("/admin/users/\(id)")
    }
    func resetPassword(id: Int) async throws {
        let _: EmptyBody = try await api.postJSON("/admin/users/\(id)/reset-password", body: EmptyBody())
    }
    func listCircuits() async throws -> [Circuit] {
        try await api.getJSON("/admin/circuits")
    }
    func createCircuit(_ c: Circuit) async throws -> Circuit {
        try await api.postJSON("/admin/circuits", body: c)
    }
    func updateCircuit(_ c: Circuit) async throws -> Circuit {
        try await api.patchJSON("/admin/circuits/\(c.id)", body: c)
    }
    func platformMetrics() async throws -> PlatformMetrics {
        try await api.getJSON("/admin/platform/metrics")
    }
}
```

`PublicService.swift`:

```swift
import Foundation

struct PublicStatus: Codable { let ok: Bool; let version: String? }

struct PublicService {
    let api = APIClient.shared
    func status() async throws -> PublicStatus { try await api.getJSON("/public/status") }
}
```

- [ ] **Step 5: Stub missing admin models (`UserListItem`, `PlatformMetrics`)**

`UserListItem.swift`:

```swift
import Foundation

struct UserListItem: Codable, Hashable, Identifiable {
    let id: Int
    var username: String
    var email: String?
    var isAdmin: Bool
    var tabAccess: [String]?
    var hasActiveSubscription: Bool?
    var subscriptionPlan: String?

    enum CodingKeys: String, CodingKey {
        case id, username, email
        case isAdmin = "is_admin"
        case tabAccess = "tab_access"
        case hasActiveSubscription = "has_active_subscription"
        case subscriptionPlan = "subscription_plan"
    }
}
```

`PlatformMetrics.swift`:

```swift
import Foundation

struct PlatformMetrics: Codable, Hashable {
    let totalUsers: Int
    let activeSubscriptions: Int
    let activeSessions: Int
    let wsConnections: Int
    let backendVersion: String?

    enum CodingKeys: String, CodingKey {
        case totalUsers = "total_users"
        case activeSubscriptions = "active_subscriptions"
        case activeSessions = "active_sessions"
        case wsConnections = "ws_connections"
        case backendVersion = "backend_version"
    }
}
```

- [ ] **Step 6: Wire + build**

```bash
for f in AuthService RaceService ConfigService AdminService PublicService; do
  ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/Services/${f}.swift"
done
for m in UserListItem PlatformMetrics; do
  ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/Models/${m}.swift"
done

xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 7: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Services/ \
        BoxBoxNow/BoxBoxNowDashboard/Models/UserListItem.swift \
        BoxBoxNow/BoxBoxNowDashboard/Models/PlatformMetrics.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): thin services (Auth/Race/Config/Admin/Public) + admin models"
```

---

### Task 9: `RaceWebSocketClient` actor + protocol + mock (TDD)

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/RaceWebSocketClient.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockRaceWebSocketClient.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Services/RaceWebSocketClientTests.swift`

This is the architectural cornerstone. It MUST be a new file — do not touch the shared `WebSocketClient.swift`.

- [ ] **Step 1: Write the protocol + client skeleton**

Create `BoxBoxNow/BoxBoxNowDashboard/Services/RaceWebSocketClient.swift`:

```swift
import Foundation

/// Protocol so stores can depend on a mockable type.
protocol RaceWebSocketClientProtocol: AnyObject {
    var messages: AsyncStream<WsMessage> { get }
    var connectionStates: AsyncStream<RaceConnectionState> { get }

    func connect(url: URL, token: String) async
    func disconnect() async
    func send(_ text: String) async throws
}

enum RaceConnectionState: Equatable {
    case connecting
    case connected
    case disconnected(reason: CloseReason)

    enum CloseReason: Equatable {
        case normal
        case sessionTerminated   // 4001
        case maxDevices          // 4003
        case networkError(String?)
    }
}

/// Actor-isolated WebSocket client.
/// - Single reconnect loop (no racy watchdog).
/// - 15s sendPing keepalive.
/// - Exponential backoff 1s → 30s between reconnects.
actor RaceWebSocketClient: RaceWebSocketClientProtocol {

    // MARK: - Public streams

    nonisolated let messages: AsyncStream<WsMessage>
    nonisolated let connectionStates: AsyncStream<RaceConnectionState>

    private let messagesContinuation: AsyncStream<WsMessage>.Continuation
    private let stateContinuation: AsyncStream<RaceConnectionState>.Continuation

    // MARK: - Internal state

    private var task: URLSessionWebSocketTask?
    private var pingTask: Task<Void, Never>?
    private var readTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?

    private var shouldReconnect = false
    private var reconnectDelayMs: UInt64 = 1_000
    private let maxReconnectDelayMs: UInt64 = 30_000

    private var currentURL: URL?
    private var currentToken: String?

    private let session: URLSession

    init(session: URLSession = URLSession(configuration: .default)) {
        self.session = session

        var msgCont: AsyncStream<WsMessage>.Continuation!
        self.messages = AsyncStream<WsMessage> { msgCont = $0 }
        self.messagesContinuation = msgCont

        var stateCont: AsyncStream<RaceConnectionState>.Continuation!
        self.connectionStates = AsyncStream<RaceConnectionState> { stateCont = $0 }
        self.stateContinuation = stateCont
    }

    deinit {
        messagesContinuation.finish()
        stateContinuation.finish()
    }

    // MARK: - Public API

    func connect(url: URL, token: String) async {
        currentURL = url
        currentToken = token
        shouldReconnect = true
        reconnectDelayMs = 1_000
        await connectLoop()
    }

    func disconnect() async {
        shouldReconnect = false
        reconnectTask?.cancel(); reconnectTask = nil
        pingTask?.cancel(); pingTask = nil
        readTask?.cancel(); readTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        stateContinuation.yield(.disconnected(reason: .normal))
    }

    func send(_ text: String) async throws {
        guard let task else { throw URLError(.notConnectedToInternet) }
        try await task.send(.string(text))
    }

    // MARK: - Internals

    private func connectLoop() async {
        stateContinuation.yield(.connecting)
        guard let url = currentURL else { return }

        let newTask = session.webSocketTask(with: url)
        self.task = newTask
        newTask.resume()

        // Keepalive: ping every 15s. Matches the Android driver fix (pingIntervalMillis = 15_000).
        pingTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 15_000_000_000) } catch { return }
                await self?.sendPing()
            }
        }

        // Assume connected once resume() is called. WS handshake errors surface via receive().
        stateContinuation.yield(.connected)
        reconnectDelayMs = 1_000

        readTask = Task { [weak self] in
            await self?.readLoop(newTask)
        }
    }

    private func sendPing() async {
        task?.sendPing { [weak self] error in
            if error != nil {
                Task { await self?.handleDisconnect(reason: .networkError(error?.localizedDescription)) }
            }
        }
    }

    private func readLoop(_ task: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                let message = try await task.receive()
                switch message {
                case .string(let text):
                    if let data = text.data(using: .utf8),
                       let wsMsg = try? JSONDecoder().decode(WsMessage.self, from: data) {
                        messagesContinuation.yield(wsMsg)
                    }
                case .data(let data):
                    if let wsMsg = try? JSONDecoder().decode(WsMessage.self, from: data) {
                        messagesContinuation.yield(wsMsg)
                    }
                @unknown default:
                    continue
                }
            } catch {
                let reason = mapCloseReason(task: task, error: error)
                await handleDisconnect(reason: reason)
                return
            }
        }
    }

    private func mapCloseReason(task: URLSessionWebSocketTask, error: Error) -> RaceConnectionState.CloseReason {
        let code = task.closeCode.rawValue
        if code == 4001 { return .sessionTerminated }
        if code == 4003 { return .maxDevices }
        return .networkError((error as NSError).localizedDescription)
    }

    private func handleDisconnect(reason: RaceConnectionState.CloseReason) async {
        pingTask?.cancel(); pingTask = nil
        readTask?.cancel(); readTask = nil
        task = nil
        stateContinuation.yield(.disconnected(reason: reason))

        // Terminal reasons: do not retry
        if case .sessionTerminated = reason { shouldReconnect = false; return }
        if case .maxDevices = reason { shouldReconnect = false; return }
        if case .normal = reason { return }

        // Transient reasons: exponential backoff reconnect
        guard shouldReconnect else { return }
        let delay = reconnectDelayMs
        reconnectDelayMs = min(reconnectDelayMs * 2, maxReconnectDelayMs)

        reconnectTask = Task { [weak self] in
            do { try await Task.sleep(nanoseconds: delay * 1_000_000) } catch { return }
            await self?.connectLoop()
        }
    }
}
```

Wire:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/Services/RaceWebSocketClient.swift
```

- [ ] **Step 2: Create the mock for tests**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockRaceWebSocketClient.swift`:

```swift
import Foundation
@testable import BoxBoxNowDashboard

final class MockRaceWebSocketClient: RaceWebSocketClientProtocol {
    let messages: AsyncStream<WsMessage>
    let connectionStates: AsyncStream<RaceConnectionState>

    private let msgCont: AsyncStream<WsMessage>.Continuation
    private let stateCont: AsyncStream<RaceConnectionState>.Continuation

    var sentFrames: [String] = []

    init() {
        var mc: AsyncStream<WsMessage>.Continuation!
        self.messages = AsyncStream<WsMessage> { mc = $0 }
        self.msgCont = mc

        var sc: AsyncStream<RaceConnectionState>.Continuation!
        self.connectionStates = AsyncStream<RaceConnectionState> { sc = $0 }
        self.stateCont = sc
    }

    func connect(url: URL, token: String) async { stateCont.yield(.connecting); stateCont.yield(.connected) }
    func disconnect() async { stateCont.yield(.disconnected(reason: .normal)) }
    func send(_ text: String) async throws { sentFrames.append(text) }

    // Test injection helpers
    func inject(_ message: WsMessage) { msgCont.yield(message) }
    func simulateClose(_ reason: RaceConnectionState.CloseReason) {
        stateCont.yield(.disconnected(reason: reason))
    }
    func finish() { msgCont.finish(); stateCont.finish() }
}
```

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Helpers/MockRaceWebSocketClient.swift
```

- [ ] **Step 3: Smoke-test the real actor with a simple connect/disconnect**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Services/RaceWebSocketClientTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

final class RaceWebSocketClientTests: XCTestCase {
    func testActorIsolatesState() async throws {
        let client = RaceWebSocketClient()
        await client.disconnect()

        // Disconnecting when never connected should yield a `.normal` state and not crash.
        var receivedState: RaceConnectionState?
        for await state in client.connectionStates {
            receivedState = state
            break
        }
        if case .disconnected(reason: .normal) = receivedState! {} else {
            XCTFail("expected .disconnected(.normal), got \(String(describing: receivedState))")
        }
    }
}
```

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Services/RaceWebSocketClientTests.swift

xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/RaceWebSocketClientTests 2>&1 | tail -10
```

Expected: 1 passing test. (Full end-to-end reconnect testing lives in Task 11 `RaceStoreWebSocketIntegrationTests`.)

- [ ] **Step 4: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Services/RaceWebSocketClient.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockRaceWebSocketClient.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Services/RaceWebSocketClientTests.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): RaceWebSocketClient actor + protocol + mock + smoke test"
```

---

### Task 10: `AuthStore` state machine (TDD)

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/AuthStore.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Stores/AuthStoreStateMachineTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockAuthService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockKeychainHelper.swift`

- [ ] **Step 1: Extract `AuthService` behind a protocol for mocking**

Modify `BoxBoxNow/BoxBoxNowDashboard/Services/AuthService.swift` — add a protocol and have the struct conform:

```swift
protocol AuthServicing {
    func login(email: String, password: String) async throws -> LoginResponse
    func verifyMFA(code: String) async throws -> LoginResponse
    func me() async throws -> User
    func logout() async throws
    func sessions() async throws -> [DeviceSession]
    func deleteSession(id: Int) async throws
}

extension AuthService: AuthServicing {}
```

- [ ] **Step 2: Write the failing state-machine tests**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockAuthService.swift`:

```swift
import Foundation
@testable import BoxBoxNowDashboard

final class MockAuthService: AuthServicing {
    var loginHandler: ((String, String) async throws -> LoginResponse)?
    var verifyMFAHandler: ((String) async throws -> LoginResponse)?
    var meHandler: (() async throws -> User)?
    var logoutHandler: (() async throws -> Void)?

    func login(email: String, password: String) async throws -> LoginResponse {
        try await loginHandler!(email, password)
    }
    func verifyMFA(code: String) async throws -> LoginResponse {
        try await verifyMFAHandler!(code)
    }
    func me() async throws -> User {
        try await meHandler!()
    }
    func logout() async throws {
        try await logoutHandler?()
    }
    func sessions() async throws -> [DeviceSession] { [] }
    func deleteSession(id: Int) async throws {}
}
```

Create `BoxBoxNow/BoxBoxNowDashboardTests/Stores/AuthStoreStateMachineTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class AuthStoreStateMachineTests: XCTestCase {

    func testInitialStateIsLoggedOut() {
        let store = AuthStore(service: MockAuthService(), keychain: MockKeychainHelper())
        XCTAssertEqual(store.authState, .loggedOut)
        XCTAssertNil(store.user)
    }

    func testSuccessfulLoginWithoutMFA() async throws {
        let mock = MockAuthService()
        let kc = MockKeychainHelper()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "tkn", user: Self.makeUser(mfaEnabled: false, mfaRequired: false), mfaRequired: false, mfaEnabled: false, mfaSecret: nil)
        }
        let store = AuthStore(service: mock, keychain: kc)

        await store.login(email: "a@b.c", password: "pw")

        XCTAssertEqual(store.authState, .loggedIn)
        XCTAssertEqual(store.user?.username, "alice")
        XCTAssertEqual(kc.savedToken, "tkn")
    }

    func testLoginWithMFARequiredGoesToNeedsMFACode() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "", user: Self.makeUser(mfaEnabled: true, mfaRequired: true), mfaRequired: true, mfaEnabled: true, mfaSecret: nil)
        }
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "pw")
        XCTAssertEqual(store.authState, .needsMFACode)
    }

    func testLoginWithMFARequiredButNotEnabledGoesToSetup() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "", user: Self.makeUser(mfaEnabled: false, mfaRequired: true), mfaRequired: true, mfaEnabled: false, mfaSecret: "otpauth://totp/…")
        }
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "pw")
        if case .needsMFASetup(let url) = store.authState {
            XCTAssertTrue(url.contains("otpauth"))
        } else {
            XCTFail("expected needsMFASetup")
        }
    }

    func testVerifyMFASuccess() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "", user: Self.makeUser(mfaEnabled: true, mfaRequired: true), mfaRequired: true, mfaEnabled: true, mfaSecret: nil)
        }
        mock.verifyMFAHandler = { code in
            XCTAssertEqual(code, "123456")
            return LoginResponse(accessToken: "final", user: Self.makeUser(mfaEnabled: true, mfaRequired: true), mfaRequired: true, mfaEnabled: true, mfaSecret: nil)
        }
        let kc = MockKeychainHelper()
        let store = AuthStore(service: mock, keychain: kc)
        await store.login(email: "a@b.c", password: "pw")
        await store.verifyMFA(code: "123456")
        XCTAssertEqual(store.authState, .loggedIn)
        XCTAssertEqual(kc.savedToken, "final")
    }

    func testLoginFailureSetsLoginFailed() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in throw APIError.unauthorized }
        let store = AuthStore(service: mock, keychain: MockKeychainHelper())
        await store.login(email: "a@b.c", password: "bad")
        if case .loginFailed(let msg) = store.authState {
            XCTAssertFalse(msg.isEmpty)
        } else {
            XCTFail("expected loginFailed")
        }
    }

    func testLogoutClearsState() async throws {
        let mock = MockAuthService()
        mock.loginHandler = { _, _ in
            LoginResponse(accessToken: "tkn", user: Self.makeUser(mfaEnabled: false, mfaRequired: false), mfaRequired: false, mfaEnabled: false, mfaSecret: nil)
        }
        mock.logoutHandler = {}
        let kc = MockKeychainHelper()
        kc.savedToken = "tkn"
        let store = AuthStore(service: mock, keychain: kc)
        await store.login(email: "a@b.c", password: "pw")
        await store.logout()
        XCTAssertEqual(store.authState, .loggedOut)
        XCTAssertNil(store.user)
        XCTAssertNil(kc.savedToken)
    }

    func testAuthExpiredNotificationLogsOut() async throws {
        let store = AuthStore(service: MockAuthService(), keychain: MockKeychainHelper())
        // Pretend we were logged in
        store.authState = .loggedIn
        NotificationCenter.default.post(name: .authExpired, object: nil)
        try await Task.sleep(nanoseconds: 100_000_000) // allow observer to fire
        XCTAssertEqual(store.authState, .loggedOut)
    }

    // MARK: - Helpers
    private static func makeUser(mfaEnabled: Bool, mfaRequired: Bool) -> User {
        User(
            id: 1, username: "alice", email: "a@b.c", isAdmin: false,
            mfaEnabled: mfaEnabled, mfaRequired: mfaRequired,
            tabAccess: ["race","pit","live","config"],
            hasActiveSubscription: true, subscriptionPlan: "pro_monthly",
            subscriptionStatus: "active", createdAt: nil
        )
    }
}
```

Create `BoxBoxNow/BoxBoxNowDashboardTests/Helpers/MockKeychainHelper.swift`:

```swift
import Foundation
@testable import BoxBoxNowDashboard

/// Injectable Keychain abstraction for tests.
protocol KeychainProtocol {
    func saveToken(_ token: String)
    func loadToken() -> String?
    func deleteToken()
}

final class MockKeychainHelper: KeychainProtocol {
    var savedToken: String?
    func saveToken(_ token: String) { savedToken = token }
    func loadToken() -> String? { savedToken }
    func deleteToken() { savedToken = nil }
}

struct RealKeychain: KeychainProtocol {
    func saveToken(_ token: String) { KeychainHelper.saveToken(token) }
    func loadToken() -> String? { KeychainHelper.loadToken() }
    func deleteToken() { KeychainHelper.deleteToken() }
}
```

If the existing driver-app `KeychainHelper` doesn't expose `saveToken`/`loadToken`/`deleteToken` as simple statics, add thin wrappers to the shared `KeychainHelper.swift` (additive). Quick check:

```bash
grep -n "func saveToken\|func loadToken\|func deleteToken" BoxBoxNow/BoxBoxNow/Services/KeychainHelper.swift
```

If the names differ, adapt `RealKeychain` to call whatever the shared type exposes.

Wire the test helpers:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Helpers/MockAuthService.swift
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Helpers/MockKeychainHelper.swift
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Stores/AuthStoreStateMachineTests.swift
```

- [ ] **Step 3: Implement `AuthStore`**

Create `BoxBoxNow/BoxBoxNowDashboard/Stores/AuthStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class AuthStore {

    enum AuthState: Equatable {
        case loggedOut
        case authenticating
        case needsMFACode
        case needsMFASetup(otpAuthURL: String)
        case loggedIn
        case loginFailed(message: String)
    }

    // Public observable state
    var authState: AuthState = .loggedOut
    var user: User?
    var pendingEmail: String = ""

    private let service: AuthServicing
    private let keychain: KeychainProtocol
    private var authExpiredObserver: NSObjectProtocol?

    init(service: AuthServicing, keychain: KeychainProtocol) {
        self.service = service
        self.keychain = keychain

        authExpiredObserver = NotificationCenter.default.addObserver(
            forName: .authExpired, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.handleAuthExpired() }
        }
    }

    deinit {
        if let obs = authExpiredObserver { NotificationCenter.default.removeObserver(obs) }
    }

    // MARK: - Actions

    func login(email: String, password: String) async {
        authState = .authenticating
        pendingEmail = email
        do {
            let resp = try await service.login(email: email, password: password)
            apply(resp)
        } catch {
            authState = .loginFailed(message: error.localizedDescription)
        }
    }

    func verifyMFA(code: String) async {
        authState = .authenticating
        do {
            let resp = try await service.verifyMFA(code: code)
            apply(resp)
        } catch {
            authState = .loginFailed(message: error.localizedDescription)
        }
    }

    func loginWithExistingToken(_ token: String) async {
        keychain.saveToken(token)
        do {
            let me = try await service.me()
            self.user = me
            self.authState = .loggedIn
        } catch {
            keychain.deleteToken()
            self.authState = .loggedOut
        }
    }

    func logout() async {
        try? await service.logout()
        keychain.deleteToken()
        user = nil
        authState = .loggedOut
    }

    func bootstrap() async {
        if let token = keychain.loadToken() {
            authState = .authenticating
            await loginWithExistingToken(token)
        } else {
            authState = .loggedOut
        }
    }

    // MARK: - Internals

    private func apply(_ resp: LoginResponse) {
        self.user = resp.user

        if resp.mfaRequired && !resp.mfaEnabled {
            let otpURL = resp.mfaSecret ?? ""
            authState = .needsMFASetup(otpAuthURL: otpURL)
            return
        }
        if resp.mfaEnabled && resp.accessToken.isEmpty {
            authState = .needsMFACode
            return
        }
        keychain.saveToken(resp.accessToken)
        authState = .loggedIn
    }

    private func handleAuthExpired() {
        keychain.deleteToken()
        user = nil
        authState = .loggedOut
    }
}
```

Wire:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/Stores/AuthStore.swift
```

- [ ] **Step 4: Run the tests — all green**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/AuthStoreStateMachineTests 2>&1 | tail -15
```

Expected: 8 passing tests.

- [ ] **Step 5: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Stores/AuthStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/AuthService.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): AuthStore state machine + tests"
```

---

### Task 11: `RaceStore` with WebSocket reducers (TDD)

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/RaceStore.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Stores/RaceStoreReducerTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardTests/Stores/RaceStoreWebSocketIntegrationTests.swift`

- [ ] **Step 1: Failing reducer tests**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Stores/RaceStoreReducerTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class RaceStoreReducerTests: XCTestCase {

    func testApplySnapshotReplacesAllState() throws {
        let store = RaceStore.makeForTests()
        let msg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        store.apply(message: msg)

        XCTAssertEqual(store.trackName, "Jarama")
        XCTAssertEqual(store.karts.count, 2)
        XCTAssertEqual(store.fifo.queue.count, 1)
        XCTAssertEqual(store.classification.count, 1)
        XCTAssertEqual(store.config?.boxLines, 2)
        XCTAssertTrue(store.raceStarted)
    }

    func testApplyUpdateMutatesSingleKart() throws {
        let store = RaceStore.makeForTests()
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self))

        let beforeLaps = store.karts[0].base.totalLaps

        let update = WsMessage(
            type: .update,
            data: nil,
            events: [
                makeEvent(event: "lap_completed", rowId: "k-1", kartNumber: 1, extra: [
                    "lastLapMs": .int(87000),
                    "totalLaps": .int(beforeLaps + 1),
                    "bestLapMs": .int(87000)
                ])
            ]
        )
        store.apply(message: update)

        XCTAssertEqual(store.karts[0].base.totalLaps, beforeLaps + 1)
        XCTAssertEqual(store.karts[0].base.lastLapMs, 87000)
        XCTAssertEqual(store.karts[1].base.totalLaps, 49, "other kart unchanged")
    }

    func testApplyFifoUpdate() throws {
        let store = RaceStore.makeForTests()
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self))
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "fifo_update", in: Self.self))

        XCTAssertEqual(store.fifo.queue.first?.kartNumber, 7)
        XCTAssertEqual(store.fifo.score, 90)
    }

    func testApplyReplayStatus() throws {
        let store = RaceStore.makeForTests()
        store.apply(message: try FixtureLoader.decode(WsMessage.self, from: "replay_status", in: Self.self))
        XCTAssertEqual(store.replayStatus.active, true)
        XCTAssertEqual(store.replayStatus.speed, 2)
    }

    func testBoxCallActiveAutoClears() async throws {
        let store = RaceStore.makeForTests(boxCallTimeout: 0.2)
        let msg = WsMessage(type: .boxCall, data: nil, events: nil)
        store.apply(message: msg)
        XCTAssertTrue(store.boxCallActive)

        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertFalse(store.boxCallActive)
    }

    // MARK: Helpers
    private func makeEvent(event: String, rowId: String, kartNumber: Int, extra: [String: JSONValue]) -> WsUpdateEvent {
        let json = try! JSONEncoder().encode([
            "event": JSONValue.string(event),
            "rowId": .string(rowId),
            "kartNumber": .int(kartNumber)
        ].merging(extra) { _, new in new })
        return try! JSONDecoder().decode(WsUpdateEvent.self, from: json)
    }
}
```

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Stores/RaceStoreReducerTests.swift
```

- [ ] **Step 2: Implement `RaceStore`**

Create `BoxBoxNow/BoxBoxNowDashboard/Stores/RaceStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class RaceStore {

    // MARK: - Observable state

    var isConnected: Bool = false
    var reconnectReason: RaceConnectionState.CloseReason?

    var raceStarted: Bool = false
    var raceFinished: Bool = false
    var countdownMs: Double = 0
    var durationMs: Double = 0
    var trackName: String = ""

    var karts: [KartStateFull] = []
    var fifo: FifoState = .empty
    var classification: [ClassificationEntry] = []
    var config: RaceConfig?

    var replayStatus: ReplayStatus = .idle
    var boxCallActive: Bool = false
    var teams: [Team] = []

    // MARK: - Dependencies

    private let wsClient: RaceWebSocketClientProtocol
    private let boxCallTimeout: TimeInterval
    private var messagesTask: Task<Void, Never>?
    private var statesTask: Task<Void, Never>?
    private var boxCallClearTask: Task<Void, Never>?

    init(wsClient: RaceWebSocketClientProtocol = RaceWebSocketClient(), boxCallTimeout: TimeInterval = 10) {
        self.wsClient = wsClient
        self.boxCallTimeout = boxCallTimeout
        startObservingClient()
    }

    static func makeForTests(boxCallTimeout: TimeInterval = 10) -> RaceStore {
        RaceStore(wsClient: MockRaceWebSocketClientAlias(), boxCallTimeout: boxCallTimeout)
    }

    // MARK: - Public API

    func connect(token: String, view: String = "full") async {
        let url = URL(string: "\(Constants.wsBaseURL)/race?token=\(token)&view=\(view)&device=web")!
        await wsClient.connect(url: url, token: token)
    }

    func disconnect() async {
        await wsClient.disconnect()
    }

    // MARK: - Reducer (pure, sync, testable)

    func apply(message: WsMessage) {
        switch message.type {
        case .snapshot:
            applySnapshot(message.data)
        case .update:
            applyUpdateEvents(message.events ?? [])
        case .fifoUpdate:
            if let fifo = message.data?.fifo { self.fifo = fifo }
        case .analytics:
            // Hooked in Phase C; merge tier scores / avg laps into existing karts
            applyAnalytics(message.data)
        case .replayStatus:
            if let rs = message.data?.replayStatus { self.replayStatus = rs }
        case .teamsUpdated:
            if let teams = message.data?.teams { self.teams = teams }
        case .boxCall:
            triggerBoxCall()
        }
    }

    private func applySnapshot(_ data: WsMessageData?) {
        guard let data else { return }
        self.raceStarted  = data.raceStarted ?? false
        self.raceFinished = data.raceFinished ?? false
        self.countdownMs  = data.countdownMs ?? 0
        self.durationMs   = data.durationMs ?? 0
        self.trackName    = data.trackName ?? ""
        self.karts        = data.karts ?? []
        self.fifo         = data.fifo ?? .empty
        self.classification = data.classification ?? []
        self.config       = data.config
    }

    private func applyUpdateEvents(_ events: [WsUpdateEvent]) {
        for ev in events {
            guard let rowId = ev.rowId,
                  let idx = karts.firstIndex(where: { $0.base.rowId == rowId }) else {
                continue
            }
            var k = karts[idx]
            var base = k.base
            if let v = ev.extra["lastLapMs"]?.doubleValue { base.lastLapMs = v }
            if let v = ev.extra["bestLapMs"]?.doubleValue { base.bestLapMs = v }
            if let v = ev.extra["avgLapMs"]?.doubleValue { base.avgLapMs = v }
            if let v = ev.extra["totalLaps"]?.intValue { base.totalLaps = v }
            if let v = ev.extra["position"]?.intValue { base.position = v }
            if let v = ev.extra["pitCount"]?.intValue { base.pitCount = v }
            if let v = ev.extra["pitStatus"]?.stringValue { base.pitStatus = v }
            if let v = ev.extra["gap"]?.stringValue { base.gap = v }
            if let v = ev.extra["interval"]?.stringValue { base.interval = v }
            if let v = ev.extra["driverName"]?.stringValue { base.driverName = v }
            if let v = ev.extra["tierScore"]?.doubleValue { base.tierScore = v }

            let rebuilt = KartStateFull(
                base: base,
                pitHistory: k.pitHistory,
                driverTotalMs: k.driverTotalMs,
                driverAvgLapMs: k.driverAvgLapMs,
                recentLaps: k.recentLaps
            )
            karts[idx] = rebuilt
        }
    }

    private func applyAnalytics(_ data: WsMessageData?) {
        // Phase C will flesh this out; for Phase A we simply accept the message
        // without state changes to keep the pipeline unblocked.
    }

    private func triggerBoxCall() {
        boxCallActive = true
        boxCallClearTask?.cancel()
        boxCallClearTask = Task { [weak self, boxCallTimeout] in
            try? await Task.sleep(nanoseconds: UInt64(boxCallTimeout * 1_000_000_000))
            await MainActor.run { self?.boxCallActive = false }
        }
    }

    func clearBoxCall() {
        boxCallClearTask?.cancel()
        boxCallActive = false
    }

    // MARK: - WebSocket wiring

    private func startObservingClient() {
        messagesTask = Task { [weak self] in
            guard let self else { return }
            for await msg in wsClient.messages {
                await MainActor.run { self.apply(message: msg) }
            }
        }
        statesTask = Task { [weak self] in
            guard let self else { return }
            for await state in wsClient.connectionStates {
                await MainActor.run { self.handleState(state) }
            }
        }
    }

    private func handleState(_ state: RaceConnectionState) {
        switch state {
        case .connecting:
            self.isConnected = false
        case .connected:
            self.isConnected = true
            self.reconnectReason = nil
        case .disconnected(let reason):
            self.isConnected = false
            self.reconnectReason = reason
        }
    }
}

/// Alias so tests can construct a mock without Type Ambiguity.
typealias MockRaceWebSocketClientAlias = MockRaceWebSocketClient
```

**Note:** the typealias above is a convenience so `RaceStore.makeForTests` resolves to the mock in the test target. If the test target can't see the dashboard target's typealias, move `makeForTests` to a test-target-only extension:

Create `BoxBoxNow/BoxBoxNowDashboardTests/Stores/RaceStore+TestHelpers.swift`:

```swift
import Foundation
@testable import BoxBoxNowDashboard

@MainActor
extension RaceStore {
    static func makeForTests(boxCallTimeout: TimeInterval = 10) -> RaceStore {
        RaceStore(wsClient: MockRaceWebSocketClient(), boxCallTimeout: boxCallTimeout)
    }
}
```

And remove the `static func makeForTests` + the alias from the main file — the tests import `RaceStore+TestHelpers.swift` instead.

Wire:
```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard BoxBoxNowDashboard/Stores/RaceStore.swift
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Stores/RaceStore+TestHelpers.swift
```

- [ ] **Step 3: Run reducer tests**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/RaceStoreReducerTests 2>&1 | tail -15
```

Expected: 5 passing tests.

- [ ] **Step 4: Integration test — mock WS feeding real store end-to-end**

Create `BoxBoxNow/BoxBoxNowDashboardTests/Stores/RaceStoreWebSocketIntegrationTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class RaceStoreWebSocketIntegrationTests: XCTestCase {

    func testFullPipelineSnapshotThenUpdate() async throws {
        let mock = MockRaceWebSocketClient()
        let store = RaceStore(wsClient: mock)

        // Drive the mock: connect, then feed a snapshot, then an update.
        await mock.connect(url: URL(string: "ws://x")!, token: "t")

        let snapMsg = try FixtureLoader.decode(WsMessage.self, from: "snapshot", in: Self.self)
        mock.inject(snapMsg)

        // Wait for the Task to drain the stream onto MainActor
        try await waitUntil(timeout: 1.0) { store.karts.count == 2 && store.isConnected }

        // Inject an update and assert the kart list reflects it
        let update = WsMessage(
            type: .update,
            data: nil,
            events: [makeEvent(rowId: "k-1", kartNumber: 1, lastLapMs: 87000, totalLaps: 51)]
        )
        mock.inject(update)
        try await waitUntil(timeout: 1.0) { store.karts[0].base.totalLaps == 51 }
        XCTAssertEqual(store.karts[0].base.lastLapMs, 87000)
    }

    func testClose4001TriggersAuthExpiredNotification() async throws {
        let mock = MockRaceWebSocketClient()
        _ = RaceStore(wsClient: mock) // keep alive

        let expectation = expectation(forNotification: .authExpired, object: nil)
        mock.simulateClose(.sessionTerminated)
        // RaceStore doesn't post this directly today; the auth-expired bridge sits
        // in AppStore wiring (Task 13). This test therefore asserts state only.

        // Wait for state to flip via the async stream
        try await Task.sleep(nanoseconds: 300_000_000)
        _ = expectation // removed — see comment above
    }

    // MARK: - Helpers

    private func waitUntil(timeout: TimeInterval, check: @MainActor () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await MainActor.run(body: check) { return }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("timeout waiting for condition")
    }

    private func makeEvent(rowId: String, kartNumber: Int, lastLapMs: Double, totalLaps: Int) -> WsUpdateEvent {
        let json: [String: JSONValue] = [
            "event": .string("lap_completed"),
            "rowId": .string(rowId),
            "kartNumber": .int(kartNumber),
            "lastLapMs": .double(lastLapMs),
            "totalLaps": .int(totalLaps)
        ]
        let data = try! JSONEncoder().encode(json)
        return try! JSONDecoder().decode(WsUpdateEvent.self, from: data)
    }
}
```

Remove the 4001-expectation test body (it's marked with a comment; the wiring for that bridge is in the `AppStore` task coming next).

```bash
ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests BoxBoxNowDashboardTests/Stores/RaceStoreWebSocketIntegrationTests.swift
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/RaceStoreWebSocketIntegrationTests 2>&1 | tail -15
```

Expected: 1 passing test (the valid one).

- [ ] **Step 5: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Stores/RaceStore.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Stores/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): RaceStore with reducers + WS integration tests"
```

---

### Task 12: `ConfigStore` and `AppStore` root container

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/AdminStore.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/AppStore.swift`
- Modify: `BoxBoxNow/BoxBoxNow/Utilities/Constants.swift` (add `wsBaseURL`)

- [ ] **Step 1: Add `wsBaseURL` to shared Constants**

Check what's already there:

```bash
grep -n "wsBaseURL\|apiBaseURL" BoxBoxNow/BoxBoxNow/Utilities/Constants.swift
```

If both constants are already present — done, move on. Otherwise insert the missing line(s) inside the existing `enum Constants { ... }` alongside the other `static let` declarations; do **not** rewrite or truncate the enum. Use this exact line for the WS URL:

```swift
static let wsBaseURL  = "wss://bbn.boxboxnow.kartingnow.com/ws"
```

And if `apiBaseURL` is missing:

```swift
static let apiBaseURL = "https://bbn.boxboxnow.kartingnow.com/api"
```

(If both are already there but not visible to the dashboard target, re-run `ruby scripts/xcode/share_files_with_dashboard.rb`.)

- [ ] **Step 2: `ConfigStore`**

Create `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class ConfigStore {
    var circuits: [Circuit] = []
    var selectedCircuitId: Int?
    var liveTimingURL: String?
    var presets: [DriverConfigPreset] = []
    var preferences: DriverPreferences?
    var isLoading: Bool = false
    var lastError: String?

    private let configService: ConfigService
    private let raceService: RaceService

    init(configService: ConfigService = ConfigService(), raceService: RaceService = RaceService()) {
        self.configService = configService
        self.raceService = raceService
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let circuits = configService.circuits()
            async let url = configService.liveTimingURL()
            async let presets = configService.presets()
            async let prefs = configService.preferences()
            self.circuits = try await circuits
            self.liveTimingURL = try? await url
            self.presets = try await presets
            self.preferences = try await prefs
            self.selectedCircuitId = self.circuits.first(where: { $0.isActive == true })?.id
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    func selectCircuit(id: Int) async {
        do {
            try await configService.selectCircuit(id: id)
            selectedCircuitId = id
        } catch {
            lastError = error.localizedDescription
        }
    }
}
```

- [ ] **Step 3: `AdminStore`**

Create `BoxBoxNow/BoxBoxNowDashboard/Stores/AdminStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class AdminStore {
    var users: [UserListItem] = []
    var circuits: [Circuit] = []
    var platformMetrics: PlatformMetrics?
    var isLoading: Bool = false
    var lastError: String?

    private let service: AdminService
    init(service: AdminService = AdminService()) { self.service = service }

    func refreshAll() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let users = service.listUsers()
            async let circs = service.listCircuits()
            async let metrics = service.platformMetrics()
            self.users = try await users
            self.circuits = try await circs
            self.platformMetrics = try? await metrics
        } catch {
            self.lastError = error.localizedDescription
        }
    }
}
```

- [ ] **Step 4: `AppStore` — root container that wires everything together**

Create `BoxBoxNow/BoxBoxNowDashboard/Stores/AppStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class AppStore {
    let auth: AuthStore
    let race: RaceStore
    let config: ConfigStore
    var admin: AdminStore?

    private var reconnectBridgeTask: Task<Void, Never>?
    private var authStateObservation: Task<Void, Never>?

    init() {
        let keychain = RealKeychain()
        let authService = AuthService()
        self.auth = AuthStore(service: authService, keychain: keychain)
        self.race = RaceStore()
        self.config = ConfigStore()
        self.admin = nil

        bootstrap()
        observeAuthState()
    }

    private func bootstrap() {
        Task { await auth.bootstrap() }
    }

    private func observeAuthState() {
        // When the user becomes logged in, connect the race WS and load config.
        authStateObservation = Task { [weak self] in
            guard let self else { return }
            var lastState: AuthStore.AuthState = .loggedOut
            while !Task.isCancelled {
                let current = self.auth.authState
                if current != lastState {
                    lastState = current
                    switch current {
                    case .loggedIn:
                        if let token = RealKeychain().loadToken() {
                            await self.race.connect(token: token)
                        }
                        await self.config.refresh()
                        if self.auth.user?.isAdmin == true {
                            self.admin = AdminStore()
                            await self.admin?.refreshAll()
                        }
                    case .loggedOut:
                        await self.race.disconnect()
                        self.admin = nil
                    default: break
                    }
                }
                try? await Task.sleep(nanoseconds: 50_000_000)
            }
        }

        // Bridge RaceStore close → AuthStore logout for 4001/4003
        reconnectBridgeTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                if case .sessionTerminated = self.race.reconnectReason ?? .normal {
                    await self.auth.logout()
                    self.race.reconnectReason = nil
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }
    }

    deinit {
        authStateObservation?.cancel()
        reconnectBridgeTask?.cancel()
    }
}
```

Wire + build:
```bash
for f in ConfigStore AdminStore AppStore; do
  ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/Stores/${f}.swift"
done

xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Stores/ \
        BoxBoxNow/BoxBoxNow/Utilities/Constants.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): ConfigStore, AdminStore, AppStore root container"
```

---

### Task 13: Backend — add `/api/auth/google/ipad` endpoints

**Files:**
- Modify: `backend/app/api/auth_routes.py`

To avoid URL-scheme conflict with the existing driver app's `boxboxnow://` scheme, the dashboard uses a distinct scheme `boxboxnowdashboard://`. We add two new routes that mirror `/google/ios` and `/google/callback/ios` but redirect to the new scheme.

- [ ] **Step 1: Add `google_login_ipad` and `google_callback_ipad`**

In `backend/app/api/auth_routes.py`, immediately after `google_callback_ios` (around line 820), add:

```python
@router.get("/google/ipad")
async def google_login_ipad(request: Request):
    """Start Google OAuth flow for iPad dashboard app — redirects back to boxboxnowdashboard:// scheme."""
    settings = get_settings()
    if not settings.google_client_id:
        raise HTTPException(501, "Google login not configured")

    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback/ipad"

    from urllib.parse import urlencode
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url)


@router.get("/google/callback/ipad")
async def google_callback_ipad(code: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback for iPad dashboard — redirects to boxboxnowdashboard:// custom scheme."""
    import httpx
    settings = get_settings()

    redirect_uri = f"{'https' if 'localhost' not in str(request.url) else 'http'}://{request.headers.get('host', 'localhost:8000')}/api/auth/google/callback/ipad"

    async with httpx.AsyncClient() as client:
        token_response = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
    if token_response.status_code != 200:
        raise HTTPException(400, "Failed to authenticate with Google")
    tokens = token_response.json()

    async with httpx.AsyncClient() as client:
        userinfo_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
    if userinfo_response.status_code != 200:
        raise HTTPException(400, "Failed to get user info from Google")

    google_user = userinfo_response.json()
    google_id = google_user["id"]
    email = google_user.get("email", "")
    name = google_user.get("name", email.split("@")[0])

    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email))
        .options(selectinload(User.tab_access), selectinload(User.subscriptions))
    )
    user = result.scalar_one_or_none()
    if not user:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(f"boxboxnowdashboard://auth?error=no_account")

    await _cleanup_stale_sessions(db, user.id)

    device_name, ip_address = _extract_device_info(request)
    session_token = secrets.token_hex(32)
    device_session = DeviceSession(
        session_token=session_token, user_id=user.id,
        device_name=f"iPad Dashboard: {device_name}", ip_address=ip_address,
    )
    db.add(device_session)
    await db.commit()

    access_token = create_token(user.id, user.username, user.is_admin, session_token)

    from fastapi.responses import RedirectResponse
    from urllib.parse import urlencode
    params = urlencode({"token": access_token})
    return RedirectResponse(f"boxboxnowdashboard://auth?{params}")
```

- [ ] **Step 2: Write a quick curl sanity-check**

With the backend running locally (`cd backend && uvicorn app.main:app`):

```bash
curl -sI http://localhost:8000/api/auth/google/ipad | head -5
```

Expected: `HTTP/1.1 307 Temporary Redirect` with `Location: https://accounts.google.com/o/oauth2/v2/auth?...`. (Won't receive the callback without a real browser flow; that's tested manually in Task 15.)

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/auth_routes.py
git commit -m "feat(auth): add /api/auth/google/ipad for iPad dashboard OAuth flow"
```

---

### Task 14: Auth UI — LoginView, MFACodeView, MFASetupView, BiometricLoginView, AuthFlowView

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Auth/LoginView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Auth/MFACodeView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Auth/MFASetupView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Auth/BiometricLoginView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Auth/AuthFlowView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/GoogleOAuthFlow.swift`

- [ ] **Step 1: `GoogleOAuthFlow`**

Create `BoxBoxNow/BoxBoxNowDashboard/Services/GoogleOAuthFlow.swift`:

```swift
import Foundation
import AuthenticationServices

enum GoogleOAuthError: Error { case noToken, cancelled }

@MainActor
final class GoogleOAuthFlow: NSObject, ASWebAuthenticationPresentationContextProviding {

    func start() async throws -> String {
        let authURL = URL(string: "\(Constants.apiBaseURL)/auth/google/ipad")!
        let scheme  = "boxboxnowdashboard"

        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
            let session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: scheme) { callbackURL, error in
                if let error {
                    cont.resume(throwing: error); return
                }
                guard let url = callbackURL else {
                    cont.resume(throwing: GoogleOAuthError.cancelled); return
                }
                guard let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "token" })?.value else {
                    cont.resume(throwing: GoogleOAuthError.noToken); return
                }
                cont.resume(returning: token)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
```

- [ ] **Step 2: `LoginView`**

Create `BoxBoxNow/BoxBoxNowDashboard/Features/Auth/LoginView.swift`:

```swift
import SwiftUI

struct LoginView: View {
    @Environment(AppStore.self) private var app

    @State private var email = ""
    @State private var password = ""
    @State private var isGoogleLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Text("BoxBoxNow").font(.bbnDisplay).foregroundColor(.bbnAccent)
            Text("Dashboard").font(.bbnHeadline).foregroundColor(.bbnTextMuted)

            BBNCard {
                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)

                    SecureField("Contraseña", text: $password)
                        .textFieldStyle(.roundedBorder)
                        .textContentType(.password)

                    if let err = errorMessage {
                        Text(err).font(.bbnCaption).foregroundColor(.bbnDanger)
                    }

                    BBNPrimaryButton(title: "Entrar", isLoading: isAuthenticating) {
                        Task { await app.auth.login(email: email, password: password) }
                    }
                    .disabled(email.isEmpty || password.isEmpty)

                    BBNSecondaryButton(title: "Continuar con Google", icon: "g.circle") {
                        Task { await startGoogle() }
                    }
                    .disabled(isGoogleLoading)
                }
                .padding(8)
            }
            .frame(maxWidth: 400)

            Spacer()
            Text("v1.0.0").font(.bbnCaption).foregroundColor(.bbnTextDim)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bbnBackground.ignoresSafeArea())
        .onChange(of: app.auth.authState) { _, new in
            if case .loginFailed(let msg) = new { errorMessage = msg }
            else { errorMessage = nil }
        }
    }

    private var isAuthenticating: Bool {
        if case .authenticating = app.auth.authState { return true }
        return false
    }

    private func startGoogle() async {
        isGoogleLoading = true
        defer { isGoogleLoading = false }
        do {
            let token = try await GoogleOAuthFlow().start()
            await app.auth.loginWithExistingToken(token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
```

- [ ] **Step 3: `MFACodeView` + `MFASetupView`**

Create `MFACodeView.swift`:

```swift
import SwiftUI

struct MFACodeView: View {
    @Environment(AppStore.self) private var app
    @State private var code = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "lock.shield").font(.system(size: 72)).foregroundColor(.bbnAccent)
            Text("Verificación en dos pasos").font(.bbnTitle).foregroundColor(.bbnText)
            Text("Introduce el código de 6 dígitos de tu app de autenticación")
                .font(.bbnBody).foregroundColor(.bbnTextMuted).multilineTextAlignment(.center)

            BBNCard {
                VStack(spacing: 16) {
                    TextField("000000", text: $code)
                        .keyboardType(.numberPad)
                        .font(.bbnMonoHuge)
                        .multilineTextAlignment(.center)
                        .padding(8)
                        .background(Color.bbnSurface)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .onChange(of: code) { _, new in
                            code = String(new.prefix(6).filter(\.isNumber))
                        }

                    if let err = errorMessage {
                        Text(err).font(.bbnCaption).foregroundColor(.bbnDanger)
                    }

                    BBNPrimaryButton(title: "Verificar", isLoading: isAuthenticating) {
                        Task { await app.auth.verifyMFA(code: code) }
                    }.disabled(code.count != 6)
                }.padding(8)
            }.frame(maxWidth: 400)
            Spacer()
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bbnBackground.ignoresSafeArea())
        .onChange(of: app.auth.authState) { _, new in
            if case .loginFailed(let m) = new { errorMessage = m } else { errorMessage = nil }
        }
    }

    private var isAuthenticating: Bool {
        if case .authenticating = app.auth.authState { return true }
        return false
    }
}
```

Create `MFASetupView.swift`:

```swift
import SwiftUI
import CoreImage.CIFilterBuiltins

struct MFASetupView: View {
    let otpAuthURL: String
    @Environment(AppStore.self) private var app
    @State private var code = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Configura la verificación en dos pasos").font(.bbnTitle).foregroundColor(.bbnText)

            if let qr = generateQR(from: otpAuthURL) {
                Image(uiImage: qr)
                    .interpolation(.none).resizable().scaledToFit()
                    .frame(width: 220, height: 220)
                    .padding(12).background(Color.white).clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Text("Escanea con Google Authenticator o similar, luego introduce el código")
                .font(.bbnBody).foregroundColor(.bbnTextMuted).multilineTextAlignment(.center)

            BBNCard {
                VStack(spacing: 12) {
                    TextField("000000", text: $code)
                        .keyboardType(.numberPad).font(.bbnMonoLarge).multilineTextAlignment(.center)
                    BBNPrimaryButton(title: "Verificar") {
                        Task { await app.auth.verifyMFA(code: code) }
                    }.disabled(code.count != 6)
                    if let err = errorMessage {
                        Text(err).font(.bbnCaption).foregroundColor(.bbnDanger)
                    }
                }.padding(8)
            }.frame(maxWidth: 400)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bbnBackground.ignoresSafeArea())
        .onChange(of: app.auth.authState) { _, new in
            if case .loginFailed(let m) = new { errorMessage = m } else { errorMessage = nil }
        }
    }

    private func generateQR(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let context = CIContext()
        guard let cgImg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImg)
    }
}
```

- [ ] **Step 4: `BiometricLoginView`**

Create `BiometricLoginView.swift`:

```swift
import SwiftUI

struct BiometricLoginView: View {
    @Environment(AppStore.self) private var app
    @State private var error: String?

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "faceid").font(.system(size: 96)).foregroundColor(.bbnAccent)
            Text("Verificando identidad…").font(.bbnBody).foregroundColor(.bbnTextMuted)
            if let error { Text(error).foregroundColor(.bbnDanger) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.bbnBackground.ignoresSafeArea())
        .task {
            let biometricOk = await BiometricService.shared.authenticate(reason: "Iniciar sesión en BoxBoxNow")
            if biometricOk, let token = KeychainHelper.loadToken() {
                await app.auth.loginWithExistingToken(token)
            } else {
                self.error = "No se pudo verificar. Usa tu contraseña."
                // Fall back to LoginView: clear any cached token
                KeychainHelper.deleteToken()
                app.auth.authState = .loggedOut
            }
        }
    }
}
```

If the existing `BiometricService` uses a different API (method not called `authenticate(reason:)`), adjust accordingly. Quick check:

```bash
grep -n "func authenticate\|static func" BoxBoxNow/BoxBoxNow/Services/BiometricService.swift
```

- [ ] **Step 5: `AuthFlowView` — router**

Create `AuthFlowView.swift`:

```swift
import SwiftUI

struct AuthFlowView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        ZStack {
            switch app.auth.authState {
            case .loggedOut, .loginFailed, .authenticating:
                LoginView()
            case .needsMFACode:
                MFACodeView()
            case .needsMFASetup(let otp):
                MFASetupView(otpAuthURL: otp)
            case .loggedIn:
                Color.clear // RootView picks this up
            }
            if case .authenticating = app.auth.authState {
                BBNLoadingOverlay(isVisible: true)
            }
        }
    }
}
```

- [ ] **Step 6: Wire and build**

```bash
for f in Services/GoogleOAuthFlow Features/Auth/LoginView Features/Auth/MFACodeView Features/Auth/MFASetupView Features/Auth/BiometricLoginView Features/Auth/AuthFlowView; do
  ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 7: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Auth/ \
        BoxBoxNow/BoxBoxNowDashboard/Services/GoogleOAuthFlow.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): auth UI (login, MFA code/setup, biometric, Google OAuth)"
```

---

### Task 15: Navigation shell (`RootView`, `SidebarView`, `DetailRouter`, status bar, `@main` entry)

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/SidebarItem.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/SidebarView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/StatusBarView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/BoxCallOverlay.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/DetailRouter.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/RootView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/PlaceholderView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboardApp.swift` (replace stub)

- [ ] **Step 1: `SidebarItem` — enum with 16 rows (15 modules + my profile trigger)**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/SidebarItem.swift`:

```swift
import Foundation

enum SidebarSection: String, CaseIterable, Identifiable {
    case liveOps = "Operación en vivo"
    case classification = "Clasificación"
    case driver = "Piloto"
    case analysis = "Análisis"
    case admin = "Admin"
    var id: String { rawValue }
}

enum SidebarItem: String, CaseIterable, Identifiable, Hashable {
    // Live ops
    case race
    case pit
    case live
    case config
    // Classification
    case adjusted
    case adjustedBeta
    // Driver
    case driver
    case driverConfig
    // Analysis
    case replay
    case analytics
    case insights
    // Admin
    case adminUsers
    case adminCircuits
    case adminHub
    case adminPlatform

    var id: String { rawValue }

    /// Matches backend `tab_access` slug 1:1.
    var tabSlug: String {
        switch self {
        case .race:           return "race"
        case .pit:            return "pit"
        case .live:           return "live"
        case .config:         return "config"
        case .adjusted:       return "adjusted"
        case .adjustedBeta:   return "adjusted-beta"
        case .driver:         return "driver"
        case .driverConfig:   return "driver-config"
        case .replay:         return "replay"
        case .analytics:      return "analytics"
        case .insights:       return "insights"
        case .adminUsers:     return "admin-users"
        case .adminCircuits:  return "admin-circuits"
        case .adminHub:       return "admin-hub"
        case .adminPlatform:  return "admin-platform"
        }
    }

    var title: String {
        switch self {
        case .race:           return "Carrera"
        case .pit:            return "Box"
        case .live:           return "Live"
        case .config:         return "Config"
        case .adjusted:       return "Clasif. Real"
        case .adjustedBeta:   return "Real Beta"
        case .driver:         return "Vista en vivo"
        case .driverConfig:   return "Config Piloto"
        case .replay:         return "Replay"
        case .analytics:      return "Karts"
        case .insights:       return "GPS Insights"
        case .adminUsers:     return "Usuarios"
        case .adminCircuits:  return "Circuitos"
        case .adminHub:       return "Circuit Hub"
        case .adminPlatform:  return "Plataforma"
        }
    }

    var systemIcon: String {
        switch self {
        case .race:           return "flag.checkered"
        case .pit:            return "wrench.and.screwdriver"
        case .live:           return "dot.radiowaves.left.and.right"
        case .config:         return "slider.horizontal.3"
        case .adjusted:       return "list.number"
        case .adjustedBeta:   return "testtube.2"
        case .driver:         return "speedometer"
        case .driverConfig:   return "square.grid.2x2"
        case .replay:         return "arrow.counterclockwise"
        case .analytics:      return "chart.bar"
        case .insights:       return "map"
        case .adminUsers:     return "person.2.fill"
        case .adminCircuits:  return "mappin.and.ellipse"
        case .adminHub:       return "building.2"
        case .adminPlatform:  return "chart.line.uptrend.xyaxis"
        }
    }

    var section: SidebarSection {
        switch self {
        case .race, .pit, .live, .config:
            return .liveOps
        case .adjusted, .adjustedBeta:
            return .classification
        case .driver, .driverConfig:
            return .driver
        case .replay, .analytics, .insights:
            return .analysis
        case .adminUsers, .adminCircuits, .adminHub, .adminPlatform:
            return .admin
        }
    }

    var requiresAdmin: Bool { section == .admin }
}
```

- [ ] **Step 2: `SidebarView` with permission filtering**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/SidebarView.swift`:

```swift
import SwiftUI

struct SidebarView: View {
    @Environment(AppStore.self) private var app
    @Binding var selection: SidebarItem?

    var body: some View {
        List(selection: $selection) {
            ForEach(SidebarSection.allCases) { section in
                let items = allowedItems(in: section)
                if !items.isEmpty {
                    Section(header:
                        Text(section.rawValue)
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    ) {
                        ForEach(items) { item in
                            NavigationLink(value: item) {
                                Label(item.title, systemImage: item.systemIcon)
                                    .foregroundStyle(BBNColors.textPrimary)
                            }
                            .listRowBackground(BBNColors.surface)
                        }
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .scrollContentBackground(.hidden)
        .background(BBNColors.background)
        .navigationTitle("BoxBoxNow")
    }

    private func allowedItems(in section: SidebarSection) -> [SidebarItem] {
        let user = app.auth.user
        let isAdmin = user?.isAdmin == true
        let tabs = Set(user?.tabAccess ?? [])
        return SidebarItem.allCases.filter { item in
            guard item.section == section else { return false }
            if item.requiresAdmin { return isAdmin && tabs.contains(item.tabSlug) }
            return tabs.contains(item.tabSlug)
        }
    }
}
```

- [ ] **Step 3: `StatusBarView` — connection indicator + account menu**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/StatusBarView.swift`:

```swift
import SwiftUI

struct StatusBarView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        HStack(spacing: 12) {
            connectionBadge
            Spacer()
            accountMenu
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(BBNColors.surface)
        .overlay(
            Rectangle()
                .fill(BBNColors.border)
                .frame(height: 0.5),
            alignment: .bottom
        )
    }

    @ViewBuilder
    private var connectionBadge: some View {
        let state = app.race.connectionState
        HStack(spacing: 6) {
            Circle()
                .fill(badgeColor(state))
                .frame(width: 8, height: 8)
            Text(badgeText(state))
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textPrimary)
        }
    }

    private var accountMenu: some View {
        Menu {
            if let user = app.auth.user {
                Text(user.email).font(BBNTypography.caption)
                Divider()
                Button("Cerrar sesión", role: .destructive) {
                    Task { await app.auth.logout() }
                }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "person.crop.circle.fill")
                    .foregroundStyle(BBNColors.accent)
                Text(app.auth.user?.username ?? "—")
                    .font(BBNTypography.body)
                    .foregroundStyle(BBNColors.textPrimary)
            }
        }
    }

    private func badgeColor(_ s: RaceConnectionState) -> Color {
        switch s {
        case .connected: return BBNColors.accent
        case .connecting: return BBNColors.warning
        case .disconnected, .terminated: return BBNColors.danger
        }
    }

    private func badgeText(_ s: RaceConnectionState) -> String {
        switch s {
        case .connected: return "Conectado"
        case .connecting: return "Conectando…"
        case .disconnected: return "Reconectando…"
        case .terminated: return "Sesión terminada"
        }
    }
}
```

- [ ] **Step 4: `BoxCallOverlay` — full-screen alert**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/BoxCallOverlay.swift`:

```swift
import SwiftUI

struct BoxCallOverlay: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        if app.race.boxCallActive {
            ZStack {
                BBNColors.danger.ignoresSafeArea()
                VStack(spacing: 20) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 120, weight: .bold))
                    Text("BOX BOX BOX")
                        .font(.system(size: 96, weight: .black, design: .rounded))
                }
                .foregroundStyle(.white)
            }
            .transition(.opacity)
            .onTapGesture { app.race.clearBoxCall() }
        }
    }
}
```

- [ ] **Step 5: `DetailRouter` — maps sidebar item to destination view**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/DetailRouter.swift`:

```swift
import SwiftUI

struct DetailRouter: View {
    let item: SidebarItem?

    var body: some View {
        Group {
            switch item {
            case .race:           RaceView()
            case .pit:            PitView()
            case .live:           LiveDashboardView()
            case .config:         ConfigView()
            case .adjusted:       AdjustedClassificationView()
            case .adjustedBeta:   AdjustedBetaClassificationView()
            case .driver:         DriverLiveView()
            case .driverConfig:   DriverConfigView()
            case .replay:         ReplayView()
            case .analytics:      KartAnalyticsView()
            case .insights:       InsightsView()
            case .adminUsers:     AdminUsersView()
            case .adminCircuits:  AdminCircuitsView()
            case .adminHub:       AdminHubView()
            case .adminPlatform:  AdminPlatformView()
            case .none:
                PlaceholderView(text: "Selecciona una opción del menú")
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background)
    }
}
```

- [ ] **Step 6: `PlaceholderView` — used by modules pending implementation**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/PlaceholderView.swift`:

```swift
import SwiftUI

struct PlaceholderView: View {
    let text: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "square.dashed")
                .font(.system(size: 48))
                .foregroundStyle(BBNColors.textMuted)
            Text(text)
                .font(BBNTypography.body)
                .foregroundStyle(BBNColors.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(BBNColors.background)
    }
}
```

For every module view referenced by `DetailRouter` that is **not yet implemented in this task**, create a stub that delegates to `PlaceholderView` so the file compiles now and gets overwritten by the real view in its own task:

```swift
// BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceView.swift
import SwiftUI
struct RaceView: View { var body: some View { PlaceholderView(text: "Carrera — en construcción") } }
```

Create identical stubs (different file path, different title) for: `PitView`, `LiveDashboardView`, `ConfigView`, `AdjustedClassificationView`, `AdjustedBetaClassificationView`, `DriverLiveView`, `DriverConfigView`, `ReplayView`, `KartAnalyticsView`, `InsightsView`, `AdminUsersView`, `AdminCircuitsView`, `AdminHubView`, `AdminPlatformView`. Each in its own file under the matching `Features/<Module>/` folder.

- [ ] **Step 7: `RootView` — `NavigationSplitView` with sidebar + status bar + detail**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Shell/RootView.swift`:

```swift
import SwiftUI

struct RootView: View {
    @Environment(AppStore.self) private var app
    @State private var selection: SidebarItem? = nil
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        ZStack {
            NavigationSplitView(columnVisibility: $columnVisibility) {
                SidebarView(selection: $selection)
            } detail: {
                VStack(spacing: 0) {
                    StatusBarView()
                    DetailRouter(item: selection)
                }
            }
            .navigationSplitViewStyle(.balanced)
            .tint(BBNColors.accent)
            .onAppear { selectFirstAvailable() }
            .onChange(of: app.auth.user?.id) { _, _ in selectFirstAvailable() }

            BoxCallOverlay()
        }
        .preferredColorScheme(.dark)
    }

    /// After login (or when user changes) snap to the first sidebar row the
    /// user has permission for. The previous selection may no longer be
    /// visible — clearing it would leave the detail blank.
    private func selectFirstAvailable() {
        guard let user = app.auth.user else { selection = nil; return }
        let tabs = Set(user.tabAccess)
        let isAdmin = user.isAdmin
        selection = SidebarItem.allCases.first { item in
            if item.requiresAdmin { return isAdmin && tabs.contains(item.tabSlug) }
            return tabs.contains(item.tabSlug)
        }
    }
}
```

- [ ] **Step 8: Replace `BoxBoxNowDashboardApp.swift` stub with real `@main` entry**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboardApp.swift`:

```swift
import SwiftUI

@main
struct BoxBoxNowDashboardApp: App {
    @State private var app = AppStore()

    var body: some Scene {
        WindowGroup {
            Group {
                if case .loggedIn = app.auth.authState {
                    RootView()
                } else {
                    AuthFlowView()
                }
            }
            .environment(app)
            .task { await app.bootstrap() }
            .preferredColorScheme(.dark)
            .tint(BBNColors.accent)
        }
    }
}
```

- [ ] **Step 9: Wire shell files + stubs into target and build**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow

SHELL_FILES=(
  Features/Shell/SidebarItem
  Features/Shell/SidebarView
  Features/Shell/StatusBarView
  Features/Shell/BoxCallOverlay
  Features/Shell/DetailRouter
  Features/Shell/RootView
  Features/Shell/PlaceholderView
)
for f in "${SHELL_FILES[@]}"; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

STUB_FILES=(
  Features/Race/RaceView
  Features/Pit/PitView
  Features/Live/LiveDashboardView
  Features/Config/ConfigView
  Features/Adjusted/AdjustedClassificationView
  Features/Adjusted/AdjustedBetaClassificationView
  Features/Driver/DriverLiveView
  Features/DriverConfig/DriverConfigView
  Features/Replay/ReplayView
  Features/Analytics/KartAnalyticsView
  Features/Insights/InsightsView
  Features/Admin/AdminUsersView
  Features/Admin/AdminCircuitsView
  Features/Admin/AdminHubView
  Features/Admin/AdminPlatformView
)
for f in "${STUB_FILES[@]}"; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -10
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 10: Smoke run**

```bash
xcrun simctl boot "iPad Pro (13-inch) (M4)" 2>/dev/null || true
xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           -configuration Debug install 2>&1 | tail -5
xcrun simctl launch "iPad Pro (13-inch) (M4)" com.boxboxnow.dashboard
```

Expected: the simulator opens the login screen. Sidebar/detail appear after logging in with a known test user; every module that is still a stub shows "— en construcción".

- [ ] **Step 11: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Shell/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Race/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Pit/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Live/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Driver/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Insights/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Admin/ \
        BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboardApp.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): navigation shell (NavigationSplitView + sidebar + module stubs)"
```

---

### Task 16: Race module — live table + kart detail sheet

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceTableHeader.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceRowView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Race/KartDetailSheet.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceFormatters.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceView.swift` (replace stub)
- Test:   `BoxBoxNow/BoxBoxNowDashboardTests/Features/Race/RaceFormattersTests.swift`

- [ ] **Step 1: Failing tests for `RaceFormatters`**

Write `BoxBoxNow/BoxBoxNowDashboardTests/Features/Race/RaceFormattersTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

final class RaceFormattersTests: XCTestCase {

    func test_lapMs_renders_mss_ss() {
        XCTAssertEqual(RaceFormatters.lapTime(ms: 52_345), "52.345")
        XCTAssertEqual(RaceFormatters.lapTime(ms: 61_004), "1:01.004")
        XCTAssertEqual(RaceFormatters.lapTime(ms: nil), "--")
    }

    func test_gap_renders_sign_and_laps() {
        XCTAssertEqual(RaceFormatters.gap(ms: 0), "+0.000")
        XCTAssertEqual(RaceFormatters.gap(ms: 1_234), "+1.234")
        XCTAssertEqual(RaceFormatters.gap(ms: -500), "-0.500")
        XCTAssertEqual(RaceFormatters.gap(laps: 2), "+2L")
    }

    func test_position_renders_ordinal() {
        XCTAssertEqual(RaceFormatters.position(1), "1º")
        XCTAssertEqual(RaceFormatters.position(10), "10º")
    }

    func test_stintElapsed_formats_minutes_seconds() {
        XCTAssertEqual(RaceFormatters.stint(elapsedMs: 125_000), "2:05")
        XCTAssertEqual(RaceFormatters.stint(elapsedMs: 0), "0:00")
        XCTAssertEqual(RaceFormatters.stint(elapsedMs: nil), "--")
    }
}
```

- [ ] **Step 2: Run test — confirm failure**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/RaceFormattersTests 2>&1 | tail -15
```

Expected: compile error — `RaceFormatters` unknown.

- [ ] **Step 3: Implement `RaceFormatters`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceFormatters.swift`:

```swift
import Foundation

enum RaceFormatters {
    static func lapTime(ms: Double?) -> String {
        guard let ms, ms > 0 else { return "--" }
        let totalMs = Int(ms.rounded())
        let minutes = totalMs / 60_000
        let seconds = (totalMs % 60_000) / 1_000
        let millis = totalMs % 1_000
        if minutes > 0 {
            return String(format: "%d:%02d.%03d", minutes, seconds, millis)
        }
        return String(format: "%d.%03d", seconds, millis)
    }

    static func gap(ms: Double) -> String {
        let sign = ms >= 0 ? "+" : "-"
        let absSec = abs(ms) / 1000.0
        return String(format: "%@%.3f", sign, absSec)
    }

    static func gap(laps: Int) -> String { "+\(laps)L" }

    static func position(_ p: Int) -> String { "\(p)º" }

    static func stint(elapsedMs: Double?) -> String {
        guard let elapsedMs, elapsedMs >= 0 else { return "--" }
        let total = Int(elapsedMs / 1000)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/RaceFormattersTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 5: `RaceTableHeader` — sticky column titles**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceTableHeader.swift`:

```swift
import SwiftUI

struct RaceTableHeader: View {
    var body: some View {
        HStack(spacing: 0) {
            cell("Pos", width: 48, align: .leading)
            cell("Kart", width: 72, align: .leading)
            cell("Piloto / Equipo", width: nil, align: .leading)
            cell("Última", width: 80, align: .trailing)
            cell("Mejor", width: 80, align: .trailing)
            cell("Gap", width: 80, align: .trailing)
            cell("Int", width: 80, align: .trailing)
            cell("Vueltas", width: 64, align: .trailing)
            cell("Pits", width: 48, align: .trailing)
        }
        .font(BBNTypography.caption)
        .foregroundStyle(BBNColors.textMuted)
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    private func cell(_ text: String, width: CGFloat?, align: Alignment) -> some View {
        Group {
            if let width {
                Text(text).frame(width: width, alignment: align)
            } else {
                Text(text).frame(maxWidth: .infinity, alignment: align)
            }
        }
    }
}
```

- [ ] **Step 6: `RaceRowView` — per-kart row**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceRowView.swift`:

```swift
import SwiftUI

struct RaceRowView: View {
    let kart: KartStateFull
    let isOurs: Bool
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            cell(RaceFormatters.position(kart.position ?? 0), width: 48, align: .leading,
                 color: isOurs ? BBNColors.accent : BBNColors.textPrimary, bold: true)

            HStack(spacing: 6) {
                KartNumberBadge(number: kart.kartNumber)
                if kart.pitStatus == "in" {
                    Text("BOX").font(BBNTypography.caption).foregroundStyle(BBNColors.warning)
                }
            }
            .frame(width: 72, alignment: .leading)

            VStack(alignment: .leading, spacing: 2) {
                Text(kart.driverName ?? "—").font(BBNTypography.body).foregroundStyle(BBNColors.textPrimary)
                if let team = kart.teamName {
                    Text(team).font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            cell(RaceFormatters.lapTime(ms: kart.lastLapMs), width: 80, align: .trailing)
            cell(RaceFormatters.lapTime(ms: kart.bestLapMs), width: 80, align: .trailing,
                 color: BBNColors.accent)
            cell(RaceFormatters.gap(ms: kart.gap ?? 0), width: 80, align: .trailing)
            cell(RaceFormatters.gap(ms: kart.interval ?? 0), width: 80, align: .trailing)
            cell("\(kart.totalLaps)", width: 64, align: .trailing)
            cell("\(kart.pitCount)", width: 48, align: .trailing)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(isOurs ? BBNColors.accent.opacity(0.08) : BBNColors.background)
        .overlay(
            Rectangle().fill(BBNColors.border.opacity(0.5)).frame(height: 0.5),
            alignment: .bottom
        )
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    @ViewBuilder
    private func cell(_ text: String, width: CGFloat, align: Alignment,
                      color: Color = BBNColors.textPrimary, bold: Bool = false) -> some View {
        Text(text)
            .font(bold ? BBNTypography.bodyBold : BBNTypography.body)
            .foregroundStyle(color)
            .monospacedDigit()
            .frame(width: width, alignment: align)
    }
}
```

- [ ] **Step 7: `KartDetailSheet` — per-kart modal with recent laps + pit history**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Race/KartDetailSheet.swift`:

```swift
import SwiftUI

struct KartDetailSheet: View {
    let kart: KartStateFull
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    summary
                    recentLaps
                    pitHistory
                }
                .padding(20)
            }
            .background(BBNColors.background.ignoresSafeArea())
            .navigationTitle("Kart \(kart.kartNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                        .tint(BBNColors.accent)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            KartNumberBadge(number: kart.kartNumber, size: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text(kart.driverName ?? "—").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
                if let team = kart.teamName {
                    Text(team).font(BBNTypography.body).foregroundStyle(BBNColors.textMuted)
                }
            }
            Spacer()
            Text(RaceFormatters.position(kart.position ?? 0))
                .font(BBNTypography.title1)
                .foregroundStyle(BBNColors.accent)
        }
    }

    private var summary: some View {
        HStack(spacing: 12) {
            BBNStatCard(label: "Mejor", value: RaceFormatters.lapTime(ms: kart.bestLapMs))
            BBNStatCard(label: "Última", value: RaceFormatters.lapTime(ms: kart.lastLapMs))
            BBNStatCard(label: "Promedio", value: RaceFormatters.lapTime(ms: kart.avgLapMs))
            BBNStatCard(label: "Vueltas", value: "\(kart.totalLaps)")
        }
    }

    @ViewBuilder
    private var recentLaps: some View {
        if let laps = kart.recentLaps, !laps.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Últimas vueltas").font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                ForEach(Array(laps.enumerated()), id: \.offset) { idx, ms in
                    HStack {
                        Text("Vuelta \(kart.totalLaps - idx)").font(BBNTypography.body).foregroundStyle(BBNColors.textPrimary)
                        Spacer()
                        Text(RaceFormatters.lapTime(ms: ms)).font(BBNTypography.body).monospacedDigit()
                            .foregroundStyle(ms == kart.bestLapMs ? BBNColors.accent : BBNColors.textPrimary)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 12)
                    .background(BBNColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    @ViewBuilder
    private var pitHistory: some View {
        if let pits = kart.pitHistory, !pits.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Historial de pits").font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                ForEach(pits) { p in
                    HStack {
                        Text("Pit \(p.index)").font(BBNTypography.body).foregroundStyle(BBNColors.textPrimary)
                        Spacer()
                        if let dur = p.durationMs {
                            Text(RaceFormatters.lapTime(ms: dur)).monospacedDigit()
                                .foregroundStyle(BBNColors.textPrimary)
                        }
                        Text("Vuelta \(p.lap)").font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 12)
                    .background(BBNColors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }
}
```

- [ ] **Step 8: `RaceView` — top-level list wiring store to rows**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Race/RaceView.swift`:

```swift
import SwiftUI

struct RaceView: View {
    @Environment(AppStore.self) private var app
    @State private var selected: KartStateFull? = nil

    var body: some View {
        VStack(spacing: 0) {
            RaceTableHeader()
            if app.race.karts.isEmpty {
                PlaceholderView(text: "Esperando snapshot…")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(sortedKarts) { kart in
                            RaceRowView(
                                kart: kart,
                                isOurs: kart.kartNumber == app.race.ourKartNumber,
                                onTap: { selected = kart }
                            )
                        }
                    }
                }
            }
        }
        .background(BBNColors.background)
        .sheet(item: $selected) { kart in
            KartDetailSheet(kart: kart)
        }
    }

    private var sortedKarts: [KartStateFull] {
        app.race.karts.sorted { ($0.position ?? Int.max) < ($1.position ?? Int.max) }
    }
}
```

- [ ] **Step 9: Wire + build + run tests + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow

for f in Features/Race/RaceFormatters Features/Race/RaceTableHeader Features/Race/RaceRowView Features/Race/KartDetailSheet; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done
ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests \
     "BoxBoxNowDashboardTests/Features/Race/RaceFormattersTests.swift"

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/RaceFormattersTests 2>&1 | tail -5
```

Expected: tests pass. Commit:

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Race/ \
        BoxBoxNow/BoxBoxNowDashboardTests/Features/Race/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): race module (table + kart detail sheet)"
```

---

### Task 17: Pit module — FIFO queue + in-pit karts + pit history

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/FifoQueueView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/InPitListView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/PitHistoryListView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/PitView.swift` (replace stub)

- [ ] **Step 1: `FifoQueueView` — shows kart numbers in order with ETA**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/FifoQueueView.swift`:

```swift
import SwiftUI

struct FifoQueueView: View {
    let snapshot: FifoSnapshot?

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Cola FIFO").font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    if let s = snapshot {
                        Text("\(s.queue.count) karts")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    }
                }

                if let s = snapshot, !s.queue.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(s.queue.enumerated()), id: \.element.id) { idx, entry in
                                VStack(spacing: 4) {
                                    Text("\(idx + 1)")
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textMuted)
                                    KartNumberBadge(number: entry.kartNumber, size: 48)
                                    Text(entry.driverName ?? "—")
                                        .font(BBNTypography.caption)
                                        .foregroundStyle(BBNColors.textPrimary)
                                        .lineLimit(1)
                                }
                                .frame(width: 80)
                                .padding(.vertical, 8)
                                .background(BBNColors.background)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                } else {
                    Text("Sin karts en cola")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                        .padding(.vertical, 24)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }
}
```

- [ ] **Step 2: `InPitListView` — karts currently in the pit lane**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/InPitListView.swift`:

```swift
import SwiftUI

struct InPitListView: View {
    let karts: [KartStateFull]

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("En boxes").font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                if karts.isEmpty {
                    Text("Nadie en boxes")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(karts) { kart in
                        HStack(spacing: 12) {
                            KartNumberBadge(number: kart.kartNumber, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(kart.driverName ?? "—")
                                    .font(BBNTypography.body)
                                    .foregroundStyle(BBNColors.textPrimary)
                                if let team = kart.teamName {
                                    Text(team).font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                                }
                            }
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text("Pos \(kart.position ?? 0)")
                                    .font(BBNTypography.caption)
                                    .foregroundStyle(BBNColors.textMuted)
                                Text("Pits \(kart.pitCount)")
                                    .font(BBNTypography.bodyBold)
                                    .foregroundStyle(BBNColors.warning)
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(BBNColors.background)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: `PitHistoryListView` — chronological pit-stop table**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/PitHistoryListView.swift`:

```swift
import SwiftUI

struct PitHistoryListView: View {
    struct Entry: Identifiable {
        let id = UUID()
        let kartNumber: Int
        let driverName: String?
        let lap: Int
        let durationMs: Double?
        let timestamp: Date?
    }
    let entries: [Entry]

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Historial reciente").font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                if entries.isEmpty {
                    Text("Sin pits registrados")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textMuted)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity)
                } else {
                    ForEach(entries) { entry in
                        HStack(spacing: 12) {
                            KartNumberBadge(number: entry.kartNumber, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.driverName ?? "—").font(BBNTypography.body).foregroundStyle(BBNColors.textPrimary)
                                Text("Vuelta \(entry.lap)").font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                            }
                            Spacer()
                            Text(RaceFormatters.lapTime(ms: entry.durationMs))
                                .font(BBNTypography.bodyBold)
                                .monospacedDigit()
                                .foregroundStyle(BBNColors.textPrimary)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 12)
                        .background(BBNColors.background)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 4: `PitView` — container pulling data from `RaceStore`**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Pit/PitView.swift`:

```swift
import SwiftUI

struct PitView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                FifoQueueView(snapshot: app.race.fifoSnapshot)
                InPitListView(karts: inPitKarts)
                PitHistoryListView(entries: historyEntries)
            }
            .padding(20)
        }
        .background(BBNColors.background)
    }

    private var inPitKarts: [KartStateFull] {
        app.race.karts
            .filter { $0.pitStatus == "in" }
            .sorted { ($0.position ?? Int.max) < ($1.position ?? Int.max) }
    }

    /// Flatten the latest 30 pit events across all karts.
    private var historyEntries: [PitHistoryListView.Entry] {
        app.race.karts
            .flatMap { kart -> [PitHistoryListView.Entry] in
                (kart.pitHistory ?? []).map { record in
                    .init(
                        kartNumber: kart.kartNumber,
                        driverName: kart.driverName,
                        lap: record.lap,
                        durationMs: record.durationMs,
                        timestamp: record.timestamp
                    )
                }
            }
            .sorted { ($0.timestamp ?? .distantPast) > ($1.timestamp ?? .distantPast) }
            .prefix(30)
            .map { $0 }
    }
}
```

- [ ] **Step 5: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow

for f in Features/Pit/FifoQueueView Features/Pit/InPitListView Features/Pit/PitHistoryListView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Pit/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): pit module (FIFO queue + in-pit + history)"
```

---

### Task 18: Live module — responsive WKWebView wrapper

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Live/LiveWebView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Live/LiveDashboardView.swift` (replace stub)

The Live tab is an embedded view of the karting track operator's public screen. We wrap the same URL in a `WKWebView` and reuse the responsive CSS that already exists server-side.

- [ ] **Step 1: `LiveWebView` — `UIViewRepresentable` around `WKWebView`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Live/LiveWebView.swift`:

```swift
import SwiftUI
import WebKit

struct LiveWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.bounces = false
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        if uiView.url != url {
            uiView.load(URLRequest(url: url))
        }
    }
}
```

- [ ] **Step 2: `LiveDashboardView` — resolves circuit-specific URL**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Live/LiveDashboardView.swift`:

```swift
import SwiftUI

struct LiveDashboardView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        ZStack {
            if let url = liveURL {
                LiveWebView(url: url).ignoresSafeArea(edges: .bottom)
            } else {
                PlaceholderView(text: "Cargando live…")
            }
        }
    }

    private var liveURL: URL? {
        guard let circuitId = app.auth.activeSession?.circuitId else {
            return URL(string: "https://boxboxnow.kartingnow.com/live")
        }
        return URL(string: "https://boxboxnow.kartingnow.com/live?circuit=\(circuitId)")
    }
}
```

- [ ] **Step 3: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/Features/Live/LiveWebView.swift"

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Live/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): live module (WKWebView wrapper)"
```

---

### Task 19: Classification module — Adjusted + Adjusted Beta

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/ClassificationRow.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/ClassificationHeader.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/AdjustedClassificationView.swift` (replace stub)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/AdjustedBetaClassificationView.swift` (replace stub)

"Clasif. Real" ranks drivers by adjusted (tier-scaled) total time across all stints. The beta variant ranks by aggregated driver stats and highlights our pilot.

- [ ] **Step 1: `ClassificationHeader` + `ClassificationRow`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/ClassificationHeader.swift`:

```swift
import SwiftUI

struct ClassificationHeader: View {
    let columns: [String]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(columns.enumerated()), id: \.offset) { _, title in
                Text(title)
                    .font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(BBNColors.surface)
    }
}
```

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/ClassificationRow.swift`:

```swift
import SwiftUI

struct ClassificationRow: View {
    let entry: ClassificationEntry
    let isOurs: Bool

    var body: some View {
        HStack(spacing: 12) {
            Text("\(entry.position)º")
                .font(BBNTypography.bodyBold)
                .foregroundStyle(isOurs ? BBNColors.accent : BBNColors.textPrimary)
                .frame(width: 48, alignment: .leading)

            KartNumberBadge(number: entry.kartNumber, size: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.driverName ?? "—").font(BBNTypography.body).foregroundStyle(BBNColors.textPrimary)
                if let team = entry.teamName {
                    Text(team).font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(RaceFormatters.lapTime(ms: entry.bestLapMs))
                .font(BBNTypography.body).monospacedDigit()
                .foregroundStyle(BBNColors.accent)
                .frame(width: 80, alignment: .trailing)

            Text(RaceFormatters.lapTime(ms: entry.adjustedTotalMs))
                .font(BBNTypography.body).monospacedDigit()
                .foregroundStyle(BBNColors.textPrimary)
                .frame(width: 100, alignment: .trailing)

            Text("\(entry.totalLaps)")
                .font(BBNTypography.body).monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
                .frame(width: 60, alignment: .trailing)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(isOurs ? BBNColors.accent.opacity(0.08) : BBNColors.background)
        .overlay(
            Rectangle().fill(BBNColors.border.opacity(0.5)).frame(height: 0.5),
            alignment: .bottom
        )
    }
}
```

- [ ] **Step 2: `AdjustedClassificationView` — the live ranking feed**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/AdjustedClassificationView.swift`:

```swift
import SwiftUI

struct AdjustedClassificationView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            ClassificationHeader(columns: ["Pos", "Kart", "Piloto", "Mejor", "Ajustado", "Vueltas"])
            if app.race.classification.isEmpty {
                PlaceholderView(text: "Esperando datos…")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(app.race.classification) { entry in
                            ClassificationRow(
                                entry: entry,
                                isOurs: entry.kartNumber == app.race.ourKartNumber
                            )
                        }
                    }
                }
            }
        }
        .background(BBNColors.background)
    }
}
```

- [ ] **Step 3: `AdjustedBetaClassificationView` — driver-centric view**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/AdjustedBetaClassificationView.swift`:

```swift
import SwiftUI

struct AdjustedBetaClassificationView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        VStack(spacing: 0) {
            ClassificationHeader(columns: ["Pos", "Kart", "Piloto", "Mejor", "Promedio", "Vueltas"])
            if sortedKarts.isEmpty {
                PlaceholderView(text: "Esperando datos…")
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(sortedKarts.enumerated()), id: \.element.id) { idx, kart in
                            let entry = ClassificationEntry(
                                position: idx + 1,
                                kartNumber: kart.kartNumber,
                                driverName: kart.driverName,
                                teamName: kart.teamName,
                                bestLapMs: kart.bestLapMs,
                                adjustedTotalMs: kart.driverAvgLapMs,
                                totalLaps: kart.totalLaps
                            )
                            ClassificationRow(
                                entry: entry,
                                isOurs: kart.kartNumber == app.race.ourKartNumber
                            )
                        }
                    }
                }
            }
        }
        .background(BBNColors.background)
    }

    private var sortedKarts: [KartStateFull] {
        app.race.karts.sorted { (a, b) in
            let aAvg = a.driverAvgLapMs ?? .infinity
            let bAvg = b.driverAvgLapMs ?? .infinity
            return aAvg < bAvg
        }
    }
}
```

- [ ] **Step 4: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Features/Adjusted/ClassificationHeader Features/Adjusted/ClassificationRow; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Adjusted/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): adjusted classification (real + beta)"
```

---

### Task 20: Config module shell + Sessions sub-tab

Phase A only delivers the **Sessions** sub-tab. The other four (Teams, Circuits, Presets, Preferences) come in Phase B (Task 23).

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigSubTab.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigSidebar.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Sessions/SessionsView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Sessions/SessionFormView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift` (replace stub)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift` (add `reloadSessions`, `createSession`, `updateSession`, `deleteSession`)

- [ ] **Step 1: `ConfigSubTab` enum**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigSubTab.swift`:

```swift
import Foundation

enum ConfigSubTab: String, CaseIterable, Identifiable, Hashable {
    case sessions, teams, circuits, presets, preferences
    var id: String { rawValue }
    var title: String {
        switch self {
        case .sessions:    return "Sesiones"
        case .teams:       return "Equipos"
        case .circuits:    return "Circuitos"
        case .presets:     return "Presets de piloto"
        case .preferences: return "Preferencias"
        }
    }
    var icon: String {
        switch self {
        case .sessions:    return "calendar"
        case .teams:       return "person.3"
        case .circuits:    return "mappin.and.ellipse"
        case .presets:     return "square.grid.2x2"
        case .preferences: return "gearshape"
        }
    }
}
```

- [ ] **Step 2: `ConfigSidebar` — secondary sidebar inside Config tab**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigSidebar.swift`:

```swift
import SwiftUI

struct ConfigSidebar: View {
    @Binding var selection: ConfigSubTab

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Configuración")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textMuted)
                .padding(.horizontal, 12)
                .padding(.top, 12)
            ForEach(ConfigSubTab.allCases) { tab in
                Button {
                    selection = tab
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: tab.icon).frame(width: 20)
                        Text(tab.title)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .foregroundStyle(selection == tab ? BBNColors.accent : BBNColors.textPrimary)
                    .background(selection == tab ? BBNColors.accent.opacity(0.1) : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .frame(width: 220)
        .background(BBNColors.surface)
    }
}
```

- [ ] **Step 3: Extend `ConfigStore` with CRUD for `RaceSession`**

Append to `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift`:

```swift
@MainActor
extension ConfigStore {
    func reloadSessions() async {
        isLoadingSessions = true
        defer { isLoadingSessions = false }
        do {
            self.sessions = try await config.fetchSessions()
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    func createSession(_ draft: SessionDraft) async -> Bool {
        do {
            _ = try await config.createSession(draft)
            await reloadSessions()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func updateSession(id: Int, draft: SessionDraft) async -> Bool {
        do {
            _ = try await config.updateSession(id: id, draft: draft)
            await reloadSessions()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func deleteSession(id: Int) async -> Bool {
        do {
            try await config.deleteSession(id: id)
            await reloadSessions()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }
}
```

Also add the stored properties at the top of `ConfigStore`:

```swift
@Observable
@MainActor
final class ConfigStore {
    private let config: ConfigServicing
    init(config: ConfigServicing) { self.config = config }

    var sessions: [RaceSession] = []
    var isLoadingSessions = false
    var lastError: String? = nil
    // Teams/circuits/presets/preferences populated in Phase B.
}
```

Define `SessionDraft` once in `BoxBoxNowDashboard/Models/SessionDraft.swift`:

```swift
import Foundation

struct SessionDraft: Codable {
    var name: String
    var circuitId: Int
    var startsAt: Date
    var durationMinutes: Int
    var ourKartNumber: Int?

    enum CodingKeys: String, CodingKey {
        case name, circuitId = "circuit_id", startsAt = "starts_at"
        case durationMinutes = "duration_minutes"
        case ourKartNumber = "our_kart_number"
    }
}
```

And extend `ConfigServicing` and `ConfigService` (from Task 8) to match:

```swift
protocol ConfigServicing {
    func fetchSessions() async throws -> [RaceSession]
    func createSession(_ draft: SessionDraft) async throws -> RaceSession
    func updateSession(id: Int, draft: SessionDraft) async throws -> RaceSession
    func deleteSession(id: Int) async throws
    // Phase B adds team/circuit/preset/preference methods
}
```

Implement them by calling the generic `get/post/patch/delete` helpers on `APIClient` from Task 7.

- [ ] **Step 4: `SessionsView` — list + form**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Sessions/SessionsView.swift`:

```swift
import SwiftUI

struct SessionsView: View {
    @Environment(AppStore.self) private var app
    @State private var showingNew = false
    @State private var editing: RaceSession? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            toolbar
            if app.config.isLoadingSessions {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                    .tint(BBNColors.accent)
            } else if app.config.sessions.isEmpty {
                PlaceholderView(text: "Sin sesiones")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(app.config.sessions) { session in
                            sessionCard(session)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .task { await app.config.reloadSessions() }
        .sheet(isPresented: $showingNew) {
            SessionFormView(initial: nil) { draft in
                let ok = await app.config.createSession(draft)
                if ok { showingNew = false }
            }
        }
        .sheet(item: $editing) { session in
            SessionFormView(initial: session) { draft in
                let ok = await app.config.updateSession(id: session.id, draft: draft)
                if ok { editing = nil }
            }
        }
    }

    private var toolbar: some View {
        HStack {
            Text("Sesiones").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
            Spacer()
            BBNPrimaryButton(title: "Nueva sesión") { showingNew = true }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    private func sessionCard(_ session: RaceSession) -> some View {
        BBNCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(session.name).font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                    Text(session.startsAt, style: .date).font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                }
                Spacer()
                Button {
                    editing = session
                } label: {
                    Image(systemName: "pencil").foregroundStyle(BBNColors.accent)
                }
                Button(role: .destructive) {
                    Task { _ = await app.config.deleteSession(id: session.id) }
                } label: {
                    Image(systemName: "trash").foregroundStyle(BBNColors.danger)
                }
            }
        }
    }
}
```

- [ ] **Step 5: `SessionFormView` — create/edit form**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Sessions/SessionFormView.swift`:

```swift
import SwiftUI

struct SessionFormView: View {
    let initial: RaceSession?
    let onSubmit: (SessionDraft) async -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(AppStore.self) private var app

    @State private var name: String = ""
    @State private var circuitId: Int = 0
    @State private var startsAt: Date = Date()
    @State private var duration: Int = 60
    @State private var ourKart: String = ""
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Datos") {
                    TextField("Nombre", text: $name)
                    DatePicker("Inicio", selection: $startsAt, displayedComponents: [.date, .hourAndMinute])
                    Stepper("Duración: \(duration) min", value: $duration, in: 5...480, step: 5)
                    TextField("Tu kart (opcional)", text: $ourKart).keyboardType(.numberPad)
                }
                Section("Circuito") {
                    if app.config.circuits.isEmpty {
                        Text("Carga los circuitos antes de crear una sesión")
                            .foregroundStyle(BBNColors.textMuted)
                    } else {
                        Picker("Circuito", selection: $circuitId) {
                            ForEach(app.config.circuits) { circuit in
                                Text(circuit.name).tag(circuit.id)
                            }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(BBNColors.background)
            .navigationTitle(initial == nil ? "Nueva sesión" : "Editar sesión")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }
                        .disabled(name.isEmpty || circuitId == 0 || saving)
                }
            }
            .task {
                if let s = initial {
                    name = s.name
                    circuitId = s.circuitId
                    startsAt = s.startsAt
                    duration = s.durationMinutes
                    ourKart = s.ourKartNumber.map(String.init) ?? ""
                }
                if app.config.circuits.isEmpty {
                    // Phase B adds reloadCircuits; if not yet loaded, no-op.
                }
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let draft = SessionDraft(
            name: name,
            circuitId: circuitId,
            startsAt: startsAt,
            durationMinutes: duration,
            ourKartNumber: Int(ourKart)
        )
        await onSubmit(draft)
    }
}
```

- [ ] **Step 6: `ConfigView` — secondary navigation split**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift`:

```swift
import SwiftUI

struct ConfigView: View {
    @State private var selection: ConfigSubTab = .sessions

    var body: some View {
        HStack(spacing: 0) {
            ConfigSidebar(selection: $selection)
            Divider().overlay(BBNColors.border)
            Group {
                switch selection {
                case .sessions:    SessionsView()
                case .teams:       PlaceholderView(text: "Equipos — Fase B")
                case .circuits:    PlaceholderView(text: "Circuitos — Fase B")
                case .presets:     PlaceholderView(text: "Presets — Fase B")
                case .preferences: PlaceholderView(text: "Preferencias — Fase B")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(BBNColors.background)
        }
    }
}
```

- [ ] **Step 7: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow

for f in Features/Config/ConfigSubTab Features/Config/ConfigSidebar \
         Features/Config/Sessions/SessionsView Features/Config/Sessions/SessionFormView \
         Models/SessionDraft; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Config/ \
        BoxBoxNow/BoxBoxNowDashboard/Models/SessionDraft.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): config shell + sessions CRUD"
```

**End of Phase A.** The app now logs in, renders the sidebar, shows live race/pit/live/classification data, and lets the user manage race sessions. Remaining modules still display their placeholders.

---

## Phase B — Config complete + Driver modules

Unlocks the remaining Config sub-tabs (Teams, Circuits, Presets, Preferences) and the two Driver-related modules ported from the existing driver app.


### Task 21: Config — Teams sub-tab

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Teams/TeamsView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Teams/TeamFormView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/TeamDraft.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift` (add teams CRUD)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift` (add team endpoints)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift` (route `.teams` to `TeamsView`)
- Test:   `BoxBoxNow/BoxBoxNowDashboardTests/Stores/ConfigStore+TeamsTests.swift`

- [ ] **Step 1: `TeamDraft` model**

Write `BoxBoxNow/BoxBoxNowDashboard/Models/TeamDraft.swift`:

```swift
import Foundation

struct TeamDraft: Codable {
    var name: String
    var sessionId: Int
    var drivers: [DriverDraft]
    var kartNumber: Int?
    var tierScore: Double?

    enum CodingKeys: String, CodingKey {
        case name, drivers
        case sessionId = "session_id"
        case kartNumber = "kart_number"
        case tierScore = "tier_score"
    }
}

struct DriverDraft: Codable, Identifiable, Hashable {
    var id: UUID = UUID()
    var name: String
    var tierScore: Double?

    enum CodingKeys: String, CodingKey {
        case name
        case tierScore = "tier_score"
    }
}
```

- [ ] **Step 2: Failing test for `ConfigStore` team reducers**

Write `BoxBoxNow/BoxBoxNowDashboardTests/Stores/ConfigStore+TeamsTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class ConfigStoreTeamsTests: XCTestCase {

    func test_reloadTeams_populates_state() async {
        let mock = MockConfigService()
        mock.teamsResponse = [
            Team(id: 1, name: "Rojo", sessionId: 10, drivers: [], kartNumber: 7, tierScore: 1.0)
        ]
        let store = ConfigStore(config: mock)
        await store.reloadTeams(sessionId: 10)
        XCTAssertEqual(store.teams.count, 1)
        XCTAssertEqual(store.teams.first?.name, "Rojo")
    }

    func test_createTeam_reloads_list() async {
        let mock = MockConfigService()
        mock.teamsResponse = []
        mock.createTeamResponse = Team(id: 99, name: "Azul", sessionId: 10, drivers: [], kartNumber: nil, tierScore: nil)
        let store = ConfigStore(config: mock)

        let ok = await store.createTeam(TeamDraft(name: "Azul", sessionId: 10, drivers: [], kartNumber: nil, tierScore: nil))
        XCTAssertTrue(ok)
        XCTAssertEqual(mock.createTeamCalls, 1)
        XCTAssertEqual(mock.fetchTeamsCalls, 1)
    }
}
```

Extend `MockConfigService` (in the Tests target, created earlier alongside `ConfigStoreTests`) with:

```swift
var teamsResponse: [Team] = []
var createTeamResponse: Team? = nil
var fetchTeamsCalls = 0
var createTeamCalls = 0

func fetchTeams(sessionId: Int) async throws -> [Team] {
    fetchTeamsCalls += 1
    return teamsResponse
}
func createTeam(_ draft: TeamDraft) async throws -> Team {
    createTeamCalls += 1
    return createTeamResponse ?? Team(id: 0, name: draft.name, sessionId: draft.sessionId, drivers: [], kartNumber: draft.kartNumber, tierScore: draft.tierScore)
}
func updateTeam(id: Int, draft: TeamDraft) async throws -> Team { createTeamResponse! }
func deleteTeam(id: Int) async throws {}
```

And create the shared `Team` model in `BoxBoxNow/BoxBoxNowDashboard/Models/Team.swift`:

```swift
import Foundation

struct Team: Identifiable, Codable, Hashable {
    let id: Int
    var name: String
    var sessionId: Int
    var drivers: [Driver]
    var kartNumber: Int?
    var tierScore: Double?

    enum CodingKeys: String, CodingKey {
        case id, name, drivers
        case sessionId = "session_id"
        case kartNumber = "kart_number"
        case tierScore = "tier_score"
    }
}

struct Driver: Identifiable, Codable, Hashable {
    let id: Int
    var name: String
    var tierScore: Double?

    enum CodingKeys: String, CodingKey {
        case id, name
        case tierScore = "tier_score"
    }
}
```

- [ ] **Step 3: Run tests — expect failure**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/ConfigStoreTeamsTests 2>&1 | tail -15
```

Expected: compile errors (`reloadTeams`, `createTeam`, `teams` unknown).

- [ ] **Step 4: Extend `ConfigService` with team endpoints**

Add these declarations to the existing `ConfigServicing` protocol (keep the session methods already there from Task 20) in `BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift`:

```swift
func fetchTeams(sessionId: Int) async throws -> [Team]
func createTeam(_ draft: TeamDraft) async throws -> Team
func updateTeam(id: Int, draft: TeamDraft) async throws -> Team
func deleteTeam(id: Int) async throws
```

Add these implementations to the existing `ConfigService` class body:

```swift
func fetchTeams(sessionId: Int) async throws -> [Team] {
    try await api.get("/teams?session_id=\(sessionId)")
}
func createTeam(_ draft: TeamDraft) async throws -> Team {
    try await api.post("/teams", body: draft)
}
func updateTeam(id: Int, draft: TeamDraft) async throws -> Team {
    try await api.patch("/teams/\(id)", body: draft)
}
func deleteTeam(id: Int) async throws {
    try await api.delete("/teams/\(id)")
}
```

- [ ] **Step 5: Extend `ConfigStore` with team CRUD**

Append to `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift`:

```swift
@MainActor
extension ConfigStore {
    var teams: [Team] {
        get { _teams }
        set { _teams = newValue }
    }

    func reloadTeams(sessionId: Int) async {
        do {
            self._teams = try await config.fetchTeams(sessionId: sessionId)
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    func createTeam(_ draft: TeamDraft) async -> Bool {
        do {
            _ = try await config.createTeam(draft)
            await reloadTeams(sessionId: draft.sessionId)
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func updateTeam(id: Int, draft: TeamDraft) async -> Bool {
        do {
            _ = try await config.updateTeam(id: id, draft: draft)
            await reloadTeams(sessionId: draft.sessionId)
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func deleteTeam(id: Int, sessionId: Int) async -> Bool {
        do {
            try await config.deleteTeam(id: id)
            await reloadTeams(sessionId: sessionId)
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }
}
```

Add `private var _teams: [Team] = []` to the main class declaration.

- [ ] **Step 6: Run tests — expect pass**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/ConfigStoreTeamsTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 7: `TeamsView` — list + session picker + form trigger**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Teams/TeamsView.swift`:

```swift
import SwiftUI

struct TeamsView: View {
    @Environment(AppStore.self) private var app
    @State private var sessionId: Int? = nil
    @State private var showingForm = false
    @State private var editing: Team? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            toolbar
            if sessionId == nil {
                PlaceholderView(text: "Selecciona una sesión")
            } else if app.config.teams.isEmpty {
                PlaceholderView(text: "Sin equipos")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(app.config.teams) { team in
                            teamCard(team)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .task {
            await app.config.reloadSessions()
            sessionId = app.config.sessions.first?.id
            if let id = sessionId { await app.config.reloadTeams(sessionId: id) }
        }
        .sheet(isPresented: $showingForm) {
            if let sid = sessionId {
                TeamFormView(initial: nil, sessionId: sid) { draft in
                    let ok = await app.config.createTeam(draft)
                    if ok { showingForm = false }
                }
            }
        }
        .sheet(item: $editing) { team in
            TeamFormView(initial: team, sessionId: team.sessionId) { draft in
                let ok = await app.config.updateTeam(id: team.id, draft: draft)
                if ok { editing = nil }
            }
        }
    }

    private var toolbar: some View {
        HStack(spacing: 12) {
            Text("Equipos").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
            if !app.config.sessions.isEmpty {
                Picker("Sesión", selection: Binding(
                    get: { sessionId ?? 0 },
                    set: { newValue in
                        sessionId = newValue
                        Task { await app.config.reloadTeams(sessionId: newValue) }
                    }
                )) {
                    ForEach(app.config.sessions) { s in
                        Text(s.name).tag(s.id)
                    }
                }
                .tint(BBNColors.accent)
            }
            Spacer()
            BBNPrimaryButton(title: "Nuevo equipo", disabled: sessionId == nil) { showingForm = true }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
        .overlay(
            Rectangle().fill(BBNColors.border).frame(height: 0.5),
            alignment: .bottom
        )
    }

    private func teamCard(_ team: Team) -> some View {
        BBNCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(team.name).font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                        if let kart = team.kartNumber {
                            KartNumberBadge(number: kart, size: 28)
                        }
                    }
                    Text(team.drivers.map(\.name).joined(separator: " · "))
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textMuted)
                }
                Spacer()
                Button { editing = team } label: {
                    Image(systemName: "pencil").foregroundStyle(BBNColors.accent)
                }
                Button(role: .destructive) {
                    Task { _ = await app.config.deleteTeam(id: team.id, sessionId: team.sessionId) }
                } label: {
                    Image(systemName: "trash").foregroundStyle(BBNColors.danger)
                }
            }
        }
    }
}
```

- [ ] **Step 8: `TeamFormView` — add/remove drivers, kart + tier**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Teams/TeamFormView.swift`:

```swift
import SwiftUI

struct TeamFormView: View {
    let initial: Team?
    let sessionId: Int
    let onSubmit: (TeamDraft) async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var kartNumber = ""
    @State private var tierScore = ""
    @State private var drivers: [DriverDraft] = []
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Datos") {
                    TextField("Nombre", text: $name)
                    TextField("Nº de kart (opcional)", text: $kartNumber).keyboardType(.numberPad)
                    TextField("Tier score (opcional)", text: $tierScore).keyboardType(.decimalPad)
                }
                Section("Pilotos") {
                    ForEach($drivers) { $driver in
                        HStack {
                            TextField("Nombre", text: $driver.name)
                            TextField("Tier", value: $driver.tierScore, format: .number)
                                .frame(width: 60)
                                .keyboardType(.decimalPad)
                            Button(role: .destructive) {
                                drivers.removeAll { $0.id == driver.id }
                            } label: {
                                Image(systemName: "minus.circle.fill")
                            }
                        }
                    }
                    Button("Añadir piloto") {
                        drivers.append(DriverDraft(name: "", tierScore: nil))
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(BBNColors.background)
            .navigationTitle(initial == nil ? "Nuevo equipo" : "Editar equipo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }
                        .disabled(name.isEmpty || drivers.isEmpty || saving)
                }
            }
            .task {
                if let t = initial {
                    name = t.name
                    kartNumber = t.kartNumber.map(String.init) ?? ""
                    tierScore = t.tierScore.map { String($0) } ?? ""
                    drivers = t.drivers.map { DriverDraft(name: $0.name, tierScore: $0.tierScore) }
                }
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let draft = TeamDraft(
            name: name,
            sessionId: sessionId,
            drivers: drivers,
            kartNumber: Int(kartNumber),
            tierScore: Double(tierScore)
        )
        await onSubmit(draft)
    }
}
```

- [ ] **Step 9: Route `.teams` in `ConfigView`**

Replace in `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift`:

```swift
case .teams: TeamsView()
```

- [ ] **Step 10: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow

for f in Models/Team Models/TeamDraft \
         Features/Config/Teams/TeamsView Features/Config/Teams/TeamFormView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done
ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests \
     "BoxBoxNowDashboardTests/Stores/ConfigStore+TeamsTests.swift"

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/ConfigStoreTeamsTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`. Commit:

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Models/Team.swift \
        BoxBoxNow/BoxBoxNowDashboard/Models/TeamDraft.swift \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/Teams/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Stores/ConfigStore+TeamsTests.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): config teams CRUD"
```

---

### Task 22: Config — Circuits sub-tab

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Circuits/CircuitsView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Circuits/CircuitFormView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/CircuitDraft.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift` (circuit CRUD + `activeCircuitId`)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift` (circuit endpoints)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift` (route `.circuits`)

- [ ] **Step 1: `CircuitDraft`**

Write `BoxBoxNow/BoxBoxNowDashboard/Models/CircuitDraft.swift`:

```swift
import Foundation

struct CircuitDraft: Codable {
    var name: String
    var lengthM: Int
    var finishLat1: Double
    var finishLon1: Double
    var finishLat2: Double
    var finishLon2: Double
    var isActive: Bool

    enum CodingKeys: String, CodingKey {
        case name
        case lengthM = "length_m"
        case finishLat1 = "finish_lat_1"
        case finishLon1 = "finish_lon_1"
        case finishLat2 = "finish_lat_2"
        case finishLon2 = "finish_lon_2"
        case isActive = "is_active"
    }
}
```

- [ ] **Step 2: Extend `ConfigService` with circuit endpoints**

Add to `ConfigServicing` and `ConfigService`:

```swift
func fetchCircuits() async throws -> [Circuit]
func createCircuit(_ draft: CircuitDraft) async throws -> Circuit
func updateCircuit(id: Int, draft: CircuitDraft) async throws -> Circuit
func deleteCircuit(id: Int) async throws
func activateCircuit(id: Int) async throws -> Circuit

// Implementations:
extension ConfigService {
    func fetchCircuits() async throws -> [Circuit] {
        try await api.get("/circuits")
    }
    func createCircuit(_ draft: CircuitDraft) async throws -> Circuit {
        try await api.post("/circuits", body: draft)
    }
    func updateCircuit(id: Int, draft: CircuitDraft) async throws -> Circuit {
        try await api.patch("/circuits/\(id)", body: draft)
    }
    func deleteCircuit(id: Int) async throws {
        try await api.delete("/circuits/\(id)")
    }
    func activateCircuit(id: Int) async throws -> Circuit {
        try await api.post("/circuits/\(id)/activate", body: EmptyBody())
    }
}

private struct EmptyBody: Codable {}
```

- [ ] **Step 3: Extend `ConfigStore` with circuit CRUD**

Append to `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift`:

```swift
@MainActor
extension ConfigStore {
    var circuits: [Circuit] {
        get { _circuits }
        set { _circuits = newValue }
    }

    func reloadCircuits() async {
        do { self._circuits = try await config.fetchCircuits() }
        catch { self.lastError = error.localizedDescription }
    }
    func createCircuit(_ draft: CircuitDraft) async -> Bool {
        do { _ = try await config.createCircuit(draft); await reloadCircuits(); return true }
        catch { lastError = error.localizedDescription; return false }
    }
    func updateCircuit(id: Int, draft: CircuitDraft) async -> Bool {
        do { _ = try await config.updateCircuit(id: id, draft: draft); await reloadCircuits(); return true }
        catch { lastError = error.localizedDescription; return false }
    }
    func deleteCircuit(id: Int) async -> Bool {
        do { try await config.deleteCircuit(id: id); await reloadCircuits(); return true }
        catch { lastError = error.localizedDescription; return false }
    }
    func activateCircuit(id: Int) async -> Bool {
        do { _ = try await config.activateCircuit(id: id); await reloadCircuits(); return true }
        catch { lastError = error.localizedDescription; return false }
    }
}
```

Add `private var _circuits: [Circuit] = []` to the main class.

- [ ] **Step 4: `CircuitsView` — list + activate toggle**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Circuits/CircuitsView.swift`:

```swift
import SwiftUI

struct CircuitsView: View {
    @Environment(AppStore.self) private var app
    @State private var showingForm = false
    @State private var editing: Circuit? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            toolbar
            if app.config.circuits.isEmpty {
                PlaceholderView(text: "Sin circuitos")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(app.config.circuits) { circuit in
                            circuitCard(circuit)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .task { await app.config.reloadCircuits() }
        .sheet(isPresented: $showingForm) {
            CircuitFormView(initial: nil) { draft in
                let ok = await app.config.createCircuit(draft)
                if ok { showingForm = false }
            }
        }
        .sheet(item: $editing) { circuit in
            CircuitFormView(initial: circuit) { draft in
                let ok = await app.config.updateCircuit(id: circuit.id, draft: draft)
                if ok { editing = nil }
            }
        }
    }

    private var toolbar: some View {
        HStack {
            Text("Circuitos").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
            Spacer()
            BBNPrimaryButton(title: "Nuevo circuito") { showingForm = true }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
    }

    private func circuitCard(_ circuit: Circuit) -> some View {
        BBNCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(circuit.name).font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                        if circuit.isActive == true {
                            Text("ACTIVO")
                                .font(BBNTypography.caption)
                                .foregroundStyle(BBNColors.accent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(BBNColors.accent.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    }
                    Text("\(circuit.lengthM) m").font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                }
                Spacer()
                if circuit.isActive != true {
                    Button("Activar") {
                        Task { _ = await app.config.activateCircuit(id: circuit.id) }
                    }
                    .tint(BBNColors.accent)
                }
                Button { editing = circuit } label: {
                    Image(systemName: "pencil").foregroundStyle(BBNColors.accent)
                }
                Button(role: .destructive) {
                    Task { _ = await app.config.deleteCircuit(id: circuit.id) }
                } label: {
                    Image(systemName: "trash").foregroundStyle(BBNColors.danger)
                }
            }
        }
    }
}
```

- [ ] **Step 5: `CircuitFormView` — lat/lon finish-line editor**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Circuits/CircuitFormView.swift`:

```swift
import SwiftUI

struct CircuitFormView: View {
    let initial: Circuit?
    let onSubmit: (CircuitDraft) async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var lengthM = "1200"
    @State private var lat1 = "0"
    @State private var lon1 = "0"
    @State private var lat2 = "0"
    @State private var lon2 = "0"
    @State private var isActive = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Datos") {
                    TextField("Nombre", text: $name)
                    TextField("Longitud (m)", text: $lengthM).keyboardType(.numberPad)
                    Toggle("Circuito activo", isOn: $isActive)
                }
                Section("Línea de meta — punto 1") {
                    TextField("Latitud 1", text: $lat1).keyboardType(.decimalPad)
                    TextField("Longitud 1", text: $lon1).keyboardType(.decimalPad)
                }
                Section("Línea de meta — punto 2") {
                    TextField("Latitud 2", text: $lat2).keyboardType(.decimalPad)
                    TextField("Longitud 2", text: $lon2).keyboardType(.decimalPad)
                }
            }
            .scrollContentBackground(.hidden)
            .background(BBNColors.background)
            .navigationTitle(initial == nil ? "Nuevo circuito" : "Editar circuito")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }
                        .disabled(name.isEmpty || saving)
                }
            }
            .task {
                if let c = initial {
                    name = c.name
                    lengthM = String(c.lengthM)
                    lat1 = String(c.finishLat1 ?? 0)
                    lon1 = String(c.finishLon1 ?? 0)
                    lat2 = String(c.finishLat2 ?? 0)
                    lon2 = String(c.finishLon2 ?? 0)
                    isActive = c.isActive ?? false
                }
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let draft = CircuitDraft(
            name: name,
            lengthM: Int(lengthM) ?? 0,
            finishLat1: Double(lat1) ?? 0,
            finishLon1: Double(lon1) ?? 0,
            finishLat2: Double(lat2) ?? 0,
            finishLon2: Double(lon2) ?? 0,
            isActive: isActive
        )
        await onSubmit(draft)
    }
}
```

- [ ] **Step 6: Route `.circuits` in `ConfigView`**

```swift
case .circuits: CircuitsView()
```

- [ ] **Step 7: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Models/CircuitDraft Features/Config/Circuits/CircuitsView Features/Config/Circuits/CircuitFormView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Models/CircuitDraft.swift \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/Circuits/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): config circuits CRUD + activation"
```

---

### Task 23: Config — Presets + Preferences sub-tabs

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Presets/PresetsView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Presets/PresetFormView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Preferences/PreferencesView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift` (preset + preferences state)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift` (preset + preferences endpoints)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift` (route `.presets` + `.preferences`)

Presets and preferences reuse the existing shared models `DriverConfigPreset` and `DriverPreferences` already shipped in `BoxBoxNowDashboard/Models/User.swift` (actually declared next to `User`). We only need the service plumbing and UI.

- [ ] **Step 1: Service endpoints**

Append to `ConfigServicing`:

```swift
func fetchPresets() async throws -> [DriverConfigPreset]
func createPreset(_ preset: DriverConfigPreset) async throws -> DriverConfigPreset
func updatePreset(id: Int, preset: DriverConfigPreset) async throws -> DriverConfigPreset
func deletePreset(id: Int) async throws
func fetchPreferences() async throws -> DriverPreferences
func updatePreferences(_ prefs: DriverPreferences) async throws -> DriverPreferences
```

Add matching `ConfigService` implementations calling `/presets` and `/me/preferences`.

- [ ] **Step 2: Store fields + actions**

Append to `ConfigStore`:

```swift
private var _presets: [DriverConfigPreset] = []
private var _preferences: DriverPreferences? = nil

@MainActor
extension ConfigStore {
    var presets: [DriverConfigPreset] { get { _presets } set { _presets = newValue } }
    var preferences: DriverPreferences? { get { _preferences } set { _preferences = newValue } }

    func reloadPresets() async {
        do { self._presets = try await config.fetchPresets() }
        catch { self.lastError = error.localizedDescription }
    }
    func savePreset(_ preset: DriverConfigPreset) async -> Bool {
        do {
            if preset.id == 0 {
                _ = try await config.createPreset(preset)
            } else {
                _ = try await config.updatePreset(id: preset.id, preset: preset)
            }
            await reloadPresets()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }
    func deletePreset(id: Int) async -> Bool {
        do { try await config.deletePreset(id: id); await reloadPresets(); return true }
        catch { lastError = error.localizedDescription; return false }
    }
    func reloadPreferences() async {
        do { self._preferences = try await config.fetchPreferences() }
        catch { self.lastError = error.localizedDescription }
    }
    func savePreferences(_ prefs: DriverPreferences) async -> Bool {
        do { self._preferences = try await config.updatePreferences(prefs); return true }
        catch { lastError = error.localizedDescription; return false }
    }
}
```

- [ ] **Step 3: `PresetsView`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Presets/PresetsView.swift`:

```swift
import SwiftUI

struct PresetsView: View {
    @Environment(AppStore.self) private var app
    @State private var showingForm = false
    @State private var editing: DriverConfigPreset? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Presets de piloto").font(BBNTypography.title2)
                    .foregroundStyle(BBNColors.textPrimary)
                Spacer()
                BBNPrimaryButton(title: "Nuevo preset") { showingForm = true }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(BBNColors.surface)

            if app.config.presets.isEmpty {
                PlaceholderView(text: "Sin presets")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(app.config.presets, id: \.id) { preset in
                            BBNCard {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(preset.name).font(BBNTypography.title3)
                                            .foregroundStyle(BBNColors.textPrimary)
                                        Text("\(preset.order.count) tarjetas")
                                            .font(BBNTypography.caption)
                                            .foregroundStyle(BBNColors.textMuted)
                                    }
                                    Spacer()
                                    Button { editing = preset } label: {
                                        Image(systemName: "pencil").foregroundStyle(BBNColors.accent)
                                    }
                                    Button(role: .destructive) {
                                        Task { _ = await app.config.deletePreset(id: preset.id) }
                                    } label: {
                                        Image(systemName: "trash").foregroundStyle(BBNColors.danger)
                                    }
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
        }
        .task { await app.config.reloadPresets() }
        .sheet(isPresented: $showingForm) {
            PresetFormView(initial: nil) { preset in
                let ok = await app.config.savePreset(preset)
                if ok { showingForm = false }
            }
        }
        .sheet(item: $editing) { preset in
            PresetFormView(initial: preset) { updated in
                let ok = await app.config.savePreset(updated)
                if ok { editing = nil }
            }
        }
    }
}
```

- [ ] **Step 4: `PresetFormView` — edit name + JSON visible/order dictionaries**

The full drag-to-reorder UI lives in the DriverConfig module (Task 25). For the Config sub-tab we only let users rename the preset and delete it; the richer editor is reached through "Edit on Driver Config". Keep this view simple but complete:

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Presets/PresetFormView.swift`:

```swift
import SwiftUI

struct PresetFormView: View {
    let initial: DriverConfigPreset?
    let onSubmit: (DriverConfigPreset) async -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var order: [String] = []
    @State private var visible: [String: Bool] = [:]
    @State private var orientation: String = "free"
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Datos") {
                    TextField("Nombre", text: $name)
                    Picker("Orientación", selection: $orientation) {
                        Text("Libre").tag("free")
                        Text("Horizontal").tag("landscape")
                        Text("Vertical").tag("portrait")
                    }
                }
                Section(header: Text("Tarjetas visibles")) {
                    ForEach(DriverCardCatalog.all, id: \.self) { key in
                        Toggle(DriverCardCatalog.title(for: key), isOn: Binding(
                            get: { visible[key] ?? false },
                            set: { newValue in
                                visible[key] = newValue
                                if newValue && !order.contains(key) { order.append(key) }
                                if !newValue { order.removeAll { $0 == key } }
                            }
                        ))
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(BBNColors.background)
            .navigationTitle(initial == nil ? "Nuevo preset" : "Editar preset")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }
                        .disabled(name.isEmpty || saving)
                }
            }
            .task {
                if let p = initial {
                    name = p.name
                    order = p.order
                    visible = p.visible
                    orientation = p.orientation ?? "free"
                }
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let preset = DriverConfigPreset(
            id: initial?.id ?? 0,
            name: name,
            order: order,
            visible: visible,
            orientation: orientation
        )
        await onSubmit(preset)
    }
}
```

Create the catalog helper `BoxBoxNow/BoxBoxNowDashboard/Models/DriverCardCatalog.swift`:

```swift
enum DriverCardCatalog {
    static let all: [String] = [
        "position", "kartNumber", "lastLap", "bestLap", "deltaBest",
        "gap", "interval", "totalLaps", "stintLaps", "stintElapsed",
        "raceClock", "gpsSpeed", "boxScore", "pitCount", "driverDifferential"
    ]
    static func title(for key: String) -> String {
        switch key {
        case "position":           return "Posición"
        case "kartNumber":         return "Kart"
        case "lastLap":            return "Última vuelta"
        case "bestLap":            return "Mejor vuelta"
        case "deltaBest":          return "Delta mejor"
        case "gap":                return "Gap"
        case "interval":           return "Intervalo"
        case "totalLaps":          return "Vueltas"
        case "stintLaps":          return "Vueltas stint"
        case "stintElapsed":       return "Tiempo stint"
        case "raceClock":          return "Reloj carrera"
        case "gpsSpeed":           return "Velocidad GPS"
        case "boxScore":           return "Box score"
        case "pitCount":           return "Nº pits"
        case "driverDifferential": return "Dif. piloto"
        default:                   return key.capitalized
        }
    }
}
```

- [ ] **Step 5: `PreferencesView`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Config/Preferences/PreferencesView.swift`:

```swift
import SwiftUI

struct PreferencesView: View {
    @Environment(AppStore.self) private var app
    @State private var defaultPresetId: Int? = nil
    @State private var showBoxAlerts: Bool = true
    @State private var alertVolume: Double = 0.8
    @State private var saving = false

    var body: some View {
        Form {
            Section("Preset por defecto") {
                if app.config.presets.isEmpty {
                    Text("Crea primero un preset en la pestaña anterior")
                        .foregroundStyle(BBNColors.textMuted)
                } else {
                    Picker("Preset", selection: $defaultPresetId) {
                        Text("Ninguno").tag(Int?.none)
                        ForEach(app.config.presets, id: \.id) { preset in
                            Text(preset.name).tag(Int?.some(preset.id))
                        }
                    }
                }
            }
            Section("Alertas") {
                Toggle("Mostrar overlay BOX", isOn: $showBoxAlerts)
                VStack(alignment: .leading) {
                    Text("Volumen de alertas: \(Int(alertVolume * 100))%")
                        .foregroundStyle(BBNColors.textMuted)
                    Slider(value: $alertVolume, in: 0...1).tint(BBNColors.accent)
                }
            }
            Section {
                BBNPrimaryButton(title: saving ? "Guardando…" : "Guardar preferencias",
                                 disabled: saving) {
                    Task { await save() }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(BBNColors.background)
        .task {
            await app.config.reloadPresets()
            await app.config.reloadPreferences()
            if let prefs = app.config.preferences {
                defaultPresetId = prefs.defaultPresetId
                showBoxAlerts = prefs.showBoxAlerts ?? true
                alertVolume = prefs.alertVolume ?? 0.8
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let prefs = DriverPreferences(
            defaultPresetId: defaultPresetId,
            showBoxAlerts: showBoxAlerts,
            alertVolume: alertVolume
        )
        _ = await app.config.savePreferences(prefs)
    }
}
```

- [ ] **Step 6: Route remaining Config tabs**

Replace the stub `.presets` and `.preferences` cases in `ConfigView`:

```swift
case .presets: PresetsView()
case .preferences: PreferencesView()
```

- [ ] **Step 7: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Models/DriverCardCatalog \
         Features/Config/Presets/PresetsView Features/Config/Presets/PresetFormView \
         Features/Config/Preferences/PreferencesView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Models/DriverCardCatalog.swift \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/Presets/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/Preferences/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Config/ConfigView.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/ConfigService.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/ConfigStore.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): config presets + preferences"
```

---

### Task 24: Driver module — live driver view port

The iPad Driver tab mirrors the driver-phone app's `DriverView`: same 2 or 3 column adaptive grid, same cards, same box-call overlay — but rendered at iPad resolution and fed by the dashboard's existing `RaceStore` rather than a separate driver-specific view model.

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverCardView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverCardKey.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverGridView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverLiveView.swift` (replace stub)

- [ ] **Step 1: `DriverCardKey` — enum + metadata**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverCardKey.swift`:

```swift
import Foundation

enum DriverCardKey: String, CaseIterable, Identifiable, Hashable {
    case position, kartNumber, lastLap, bestLap, deltaBest
    case gap, interval, totalLaps, stintLaps, stintElapsed
    case raceClock, gpsSpeed, boxScore, pitCount, driverDifferential

    var id: String { rawValue }

    static func fromKey(_ key: String) -> DriverCardKey? { DriverCardKey(rawValue: key) }

    var title: String { DriverCardCatalog.title(for: rawValue) }
}
```

- [ ] **Step 2: `DriverCardView` — render one card**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverCardView.swift`:

```swift
import SwiftUI

struct DriverCardView: View {
    let key: DriverCardKey
    let ourKart: KartStateFull?
    let raceClockMs: Double
    let height: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(key.title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(BBNColors.textMuted)
            Spacer()
            Text(mainValue)
                .font(.system(size: valueFontSize, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(valueColor)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(16)
        .frame(height: height)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var valueFontSize: CGFloat {
        min(height * 0.45, 96)
    }

    private var valueColor: Color {
        switch key {
        case .bestLap: return BBNColors.accent
        case .deltaBest: return deltaColor
        default: return BBNColors.textPrimary
        }
    }

    private var deltaColor: Color {
        guard let kart = ourKart, let last = kart.lastLapMs, let best = kart.bestLapMs else {
            return BBNColors.textPrimary
        }
        return last <= best ? BBNColors.accent : BBNColors.danger
    }

    private var mainValue: String {
        guard let kart = ourKart else { return "--" }
        switch key {
        case .position:     return RaceFormatters.position(kart.position ?? 0)
        case .kartNumber:   return "\(kart.kartNumber)"
        case .lastLap:      return RaceFormatters.lapTime(ms: kart.lastLapMs)
        case .bestLap:      return RaceFormatters.lapTime(ms: kart.bestLapMs)
        case .deltaBest:
            guard let last = kart.lastLapMs, let best = kart.bestLapMs else { return "--" }
            return RaceFormatters.gap(ms: last - best)
        case .gap:          return RaceFormatters.gap(ms: kart.gap ?? 0)
        case .interval:     return RaceFormatters.gap(ms: kart.interval ?? 0)
        case .totalLaps:    return "\(kart.totalLaps)"
        case .stintLaps:    return "\(kart.stintLapsCount ?? 0)"
        case .stintElapsed: return RaceFormatters.stint(elapsedMs: kart.stintElapsedMs)
        case .raceClock:    return RaceFormatters.stint(elapsedMs: raceClockMs)
        case .gpsSpeed:     return "--" // Hooked up to GPS VM in future iteration
        case .boxScore:     return "\(Int(kart.tierScore ?? 0))"
        case .pitCount:     return "\(kart.pitCount)"
        case .driverDifferential:
            return RaceFormatters.gap(ms: kart.driverDifferentialMs ?? 0)
        }
    }
}
```

- [ ] **Step 3: `DriverGridView` — responsive 2/3 column grid**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverGridView.swift`:

```swift
import SwiftUI

struct DriverGridView: View {
    let cards: [DriverCardKey]
    let ourKart: KartStateFull?
    let raceClockMs: Double

    var body: some View {
        GeometryReader { geo in
            let isLandscape = geo.size.width > geo.size.height
            let numCols = isLandscape ? 3 : 2
            let spacing: CGFloat = 8
            let numRows = max(1, (cards.count + numCols - 1) / numCols)
            let totalVSpacing = spacing * CGFloat(numRows + 1)
            let cardHeight = max(90, (geo.size.height - totalVSpacing) / CGFloat(numRows))

            VStack(spacing: spacing) {
                ForEach(Array(cards.chunked(into: numCols).enumerated()), id: \.offset) { _, row in
                    HStack(spacing: spacing) {
                        ForEach(row) { key in
                            DriverCardView(
                                key: key,
                                ourKart: ourKart,
                                raceClockMs: raceClockMs,
                                height: cardHeight
                            )
                        }
                        ForEach(0..<(numCols - row.count), id: \.self) { _ in
                            Color.clear.frame(height: cardHeight)
                        }
                    }
                }
            }
            .padding(spacing)
        }
        .background(Color.black)
    }
}

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
    }
}
```

- [ ] **Step 4: `DriverLiveView` — full-screen immersive view**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Driver/DriverLiveView.swift`:

```swift
import SwiftUI

struct DriverLiveView: View {
    @Environment(AppStore.self) private var app
    @State private var raceClockMs: Double = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            DriverGridView(
                cards: visibleCards,
                ourKart: ourKart,
                raceClockMs: raceClockMs
            )
        }
        .ignoresSafeArea(edges: .all)
        .task {
            while !Task.isCancelled {
                raceClockMs = app.race.interpolatedClockMs()
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
        }
    }

    private var visibleCards: [DriverCardKey] {
        guard let preset = app.config.preferences?.defaultPresetId
            .flatMap({ id in app.config.presets.first { $0.id == id } })
        else {
            return DriverCardKey.allCases
        }
        return preset.order
            .compactMap { DriverCardKey.fromKey($0) }
            .filter { preset.visible[$0.rawValue] == true }
    }

    private var ourKart: KartStateFull? {
        guard let num = app.race.ourKartNumber else { return nil }
        return app.race.karts.first { $0.kartNumber == num }
    }
}
```

`RaceStore.interpolatedClockMs()` should return the wall-clock age of the latest race snapshot, matching the existing driver-app implementation. Add it to `RaceStore`:

```swift
func interpolatedClockMs() -> Double {
    guard let snapshotTime = lastSnapshotAt else { return 0 }
    return Date().timeIntervalSince(snapshotTime) * 1000
}
```

…and store `lastSnapshotAt: Date?` when `applySnapshot(...)` runs.

- [ ] **Step 5: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Features/Driver/DriverCardKey Features/Driver/DriverCardView Features/Driver/DriverGridView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Driver/ \
        BoxBoxNow/BoxBoxNowDashboard/Stores/RaceStore.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): driver live view (responsive card grid)"
```

---

### Task 25: Driver Config module — drag-to-reorder preset editor

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/PresetPicker.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/OrderableCardList.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/PreviewGridView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/DriverConfigView.swift` (replace stub)

- [ ] **Step 1: `PresetPicker` — dropdown + create/duplicate/delete**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/PresetPicker.swift`:

```swift
import SwiftUI

struct PresetPicker: View {
    @Environment(AppStore.self) private var app
    @Binding var selection: DriverConfigPreset?

    var body: some View {
        HStack(spacing: 8) {
            Menu {
                ForEach(app.config.presets, id: \.id) { preset in
                    Button(preset.name) { selection = preset }
                }
                if !app.config.presets.isEmpty { Divider() }
                Button("Nuevo preset") { selection = blankPreset() }
            } label: {
                HStack {
                    Text(selection?.name ?? "Selecciona preset")
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textPrimary)
                    Image(systemName: "chevron.down")
                        .foregroundStyle(BBNColors.textMuted)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(BBNColors.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            if let current = selection {
                Button {
                    Task {
                        let ok = await app.config.savePreset(current)
                        if ok { selection = app.config.presets.first { $0.id == current.id } ?? current }
                    }
                } label: {
                    Label("Guardar", systemImage: "checkmark.circle.fill")
                        .labelStyle(.titleAndIcon)
                        .foregroundStyle(BBNColors.accent)
                }
                if current.id != 0 {
                    Button(role: .destructive) {
                        Task {
                            _ = await app.config.deletePreset(id: current.id)
                            selection = app.config.presets.first
                        }
                    } label: {
                        Image(systemName: "trash").foregroundStyle(BBNColors.danger)
                    }
                }
            }
        }
    }

    private func blankPreset() -> DriverConfigPreset {
        DriverConfigPreset(
            id: 0,
            name: "Preset \(app.config.presets.count + 1)",
            order: DriverCardKey.allCases.map(\.rawValue),
            visible: Dictionary(uniqueKeysWithValues: DriverCardKey.allCases.map { ($0.rawValue, true) }),
            orientation: "free"
        )
    }
}
```

- [ ] **Step 2: `OrderableCardList` — drag-to-reorder + visibility toggle**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/OrderableCardList.swift`:

```swift
import SwiftUI

struct OrderableCardList: View {
    @Binding var order: [String]
    @Binding var visible: [String: Bool]

    var body: some View {
        List {
            ForEach(order, id: \.self) { key in
                HStack {
                    Image(systemName: "line.3.horizontal")
                        .foregroundStyle(BBNColors.textMuted)
                    Text(DriverCardCatalog.title(for: key))
                        .font(BBNTypography.body)
                        .foregroundStyle(BBNColors.textPrimary)
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { visible[key] ?? false },
                        set: { visible[key] = $0 }
                    ))
                    .labelsHidden()
                    .tint(BBNColors.accent)
                }
                .listRowBackground(BBNColors.surface)
            }
            .onMove { indices, newOffset in
                order.move(fromOffsets: indices, toOffset: newOffset)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(BBNColors.background)
        .environment(\.editMode, .constant(.active))
    }
}
```

- [ ] **Step 3: `PreviewGridView` — live preview using fake kart data**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/PreviewGridView.swift`:

```swift
import SwiftUI

struct PreviewGridView: View {
    let order: [String]
    let visible: [String: Bool]

    var body: some View {
        let keys = order
            .compactMap { DriverCardKey.fromKey($0) }
            .filter { visible[$0.rawValue] == true }

        let mock = KartStateFull.preview

        DriverGridView(cards: keys, ourKart: mock, raceClockMs: 123_456)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.black)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(BBNColors.border, lineWidth: 1)
            )
    }
}
```

Add a preview helper to `KartStateFull+Dashboard.swift`:

```swift
extension KartStateFull {
    static var preview: KartStateFull {
        KartStateFull(
            base: KartState(
                rowId: 1, kartNumber: 7, position: 3, totalLaps: 24,
                lastLapMs: 52345, bestLapMs: 51123, avgLapMs: 52500,
                bestAvgMs: 51800, bestStintLapMs: 51123, gap: 1234, interval: 456,
                pitCount: 2, pitStatus: "out", stintLapsCount: 12,
                stintDurationS: 720, stintElapsedMs: 540000, stintStartCountdownMs: nil,
                stintStartTime: nil, tierScore: 1.0, driverName: "Preview",
                teamName: "Demo Team", driverDifferentialMs: 234
            ),
            pitHistory: [], driverTotalMs: 1_250_000, driverAvgLapMs: 52500, recentLaps: []
        )
    }
}
```

- [ ] **Step 4: `DriverConfigView` — three-pane editor**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/DriverConfigView.swift`:

```swift
import SwiftUI

struct DriverConfigView: View {
    @Environment(AppStore.self) private var app
    @State private var selection: DriverConfigPreset? = nil

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Config piloto").font(BBNTypography.title2)
                    .foregroundStyle(BBNColors.textPrimary)
                Spacer()
                PresetPicker(selection: $selection)
            }
            .padding(20)
            .background(BBNColors.surface)
            Divider().overlay(BBNColors.border)
            if let preset = selection {
                editor(for: preset)
            } else {
                PlaceholderView(text: "Selecciona o crea un preset")
            }
        }
        .task {
            await app.config.reloadPresets()
            if selection == nil { selection = app.config.presets.first }
        }
    }

    @ViewBuilder
    private func editor(for preset: DriverConfigPreset) -> some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Tarjetas").font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                OrderableCardList(
                    order: Binding(
                        get: { selection?.order ?? [] },
                        set: { selection?.order = $0 }
                    ),
                    visible: Binding(
                        get: { selection?.visible ?? [:] },
                        set: { selection?.visible = $0 }
                    )
                )
            }
            .frame(width: 320)

            VStack(alignment: .leading, spacing: 8) {
                Text("Vista previa").font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                PreviewGridView(
                    order: selection?.order ?? [],
                    visible: selection?.visible ?? [:]
                )
            }
            .frame(maxWidth: .infinity)
        }
        .padding(20)
    }
}
```

Note: since `DriverConfigPreset` fields are `let`, edit them by replacing the struct entirely. The example above assumes they are `var`; in the Models chapter of Phase A we already committed to `var` for `order`, `visible`, `orientation`. If those are `let` in the shared driver model, add a private `EditablePreset` struct that mirrors the fields as `var`, mutate it, and submit a fresh `DriverConfigPreset` to the store.

- [ ] **Step 5: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Features/DriverConfig/PresetPicker Features/DriverConfig/OrderableCardList \
         Features/DriverConfig/PreviewGridView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/DriverConfig/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): driver config preset editor"
```

**End of Phase B.** All Config sub-tabs are live, the Driver view mirrors the phone app at iPad resolution, and the preset editor saves changes to the same REST endpoints used by the driver app.

---

## Phase C — Analysis & replay

Delivers Replay (with `ReplayTimelineView` Canvas), Analytics (Kart cards + detail sheet with Swift Charts) and Insights (trajectory / speed / g-force canvases). These share a lot of infrastructure: an Apex replay service fetching snapshots, a shared `TelemetryAggregator` for kart stats, and Canvas-based rendering primitives.


### Task 26: Apex replay service + `ReplayStore`

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/ReplaySnapshot.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/ReplayService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/ReplayStore.swift`
- Test:   `BoxBoxNow/BoxBoxNowDashboardTests/Stores/ReplayStoreTests.swift`
- Test:   `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/replay_snapshot.json`

- [ ] **Step 1: Models**

Write `BoxBoxNow/BoxBoxNowDashboard/Models/ReplaySnapshot.swift`:

```swift
import Foundation

/// One replay frame — snapshot of every kart at a given `elapsedMs` point.
struct ReplaySnapshot: Codable, Identifiable, Hashable {
    var id: Double { elapsedMs }
    let elapsedMs: Double
    let karts: [ReplayKart]

    enum CodingKeys: String, CodingKey {
        case elapsedMs = "elapsed_ms"
        case karts
    }
}

struct ReplayKart: Codable, Hashable {
    let kartNumber: Int
    let position: Int
    let totalLaps: Int
    let lastLapMs: Double?
    let bestLapMs: Double?
    let gap: Double?
    let pitStatus: String?

    enum CodingKeys: String, CodingKey {
        case kartNumber = "kart_number"
        case position
        case totalLaps = "total_laps"
        case lastLapMs = "last_lap_ms"
        case bestLapMs = "best_lap_ms"
        case gap
        case pitStatus = "pit_status"
    }
}

struct ReplayManifest: Codable {
    let sessionId: Int
    let name: String
    let startedAt: Date
    let durationMs: Double
    let sampleIntervalMs: Double

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case name
        case startedAt = "started_at"
        case durationMs = "duration_ms"
        case sampleIntervalMs = "sample_interval_ms"
    }
}
```

- [ ] **Step 2: Fixture**

Write `BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/replay_snapshot.json`:

```json
{
  "manifest": {
    "session_id": 42,
    "name": "Demo",
    "started_at": "2026-04-14T19:00:00Z",
    "duration_ms": 1800000.0,
    "sample_interval_ms": 1000.0
  },
  "snapshots": [
    {
      "elapsed_ms": 0.0,
      "karts": [
        {"kart_number": 7, "position": 1, "total_laps": 0, "last_lap_ms": null, "best_lap_ms": null, "gap": 0.0, "pit_status": "out"}
      ]
    },
    {
      "elapsed_ms": 60000.0,
      "karts": [
        {"kart_number": 7, "position": 1, "total_laps": 1, "last_lap_ms": 52345.0, "best_lap_ms": 52345.0, "gap": 0.0, "pit_status": "out"}
      ]
    }
  ]
}
```

- [ ] **Step 3: Failing tests**

Write `BoxBoxNow/BoxBoxNowDashboardTests/Stores/ReplayStoreTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class ReplayStoreTests: XCTestCase {

    func test_load_populates_manifest_and_frames() async throws {
        let mock = MockReplayService()
        mock.manifestResponse = ReplayManifest(
            sessionId: 42, name: "Demo",
            startedAt: .init(timeIntervalSince1970: 0),
            durationMs: 1_800_000, sampleIntervalMs: 1000
        )
        mock.snapshotsResponse = [
            ReplaySnapshot(elapsedMs: 0, karts: []),
            ReplaySnapshot(elapsedMs: 60_000, karts: [])
        ]
        let store = ReplayStore(service: mock)
        await store.load(sessionId: 42)

        XCTAssertNotNil(store.manifest)
        XCTAssertEqual(store.frames.count, 2)
        XCTAssertFalse(store.isLoading)
    }

    func test_seek_snaps_to_nearest_frame() async {
        let mock = MockReplayService()
        mock.snapshotsResponse = [
            ReplaySnapshot(elapsedMs: 0, karts: []),
            ReplaySnapshot(elapsedMs: 60_000, karts: []),
            ReplaySnapshot(elapsedMs: 120_000, karts: [])
        ]
        mock.manifestResponse = ReplayManifest(
            sessionId: 1, name: "x",
            startedAt: .init(timeIntervalSince1970: 0),
            durationMs: 120_000, sampleIntervalMs: 60_000
        )
        let store = ReplayStore(service: mock)
        await store.load(sessionId: 1)

        store.seek(to: 70_000)
        XCTAssertEqual(store.currentFrame?.elapsedMs, 60_000)

        store.seek(to: 95_000)
        XCTAssertEqual(store.currentFrame?.elapsedMs, 120_000)
    }

    func test_playPause_advances_time() async {
        let mock = MockReplayService()
        mock.snapshotsResponse = [
            ReplaySnapshot(elapsedMs: 0, karts: []),
            ReplaySnapshot(elapsedMs: 1000, karts: []),
            ReplaySnapshot(elapsedMs: 2000, karts: [])
        ]
        mock.manifestResponse = ReplayManifest(
            sessionId: 1, name: "x",
            startedAt: .init(timeIntervalSince1970: 0),
            durationMs: 2000, sampleIntervalMs: 1000
        )
        let store = ReplayStore(service: mock)
        await store.load(sessionId: 1)

        store.play()
        XCTAssertTrue(store.isPlaying)
        store.pause()
        XCTAssertFalse(store.isPlaying)
    }
}

final class MockReplayService: ReplayServicing {
    var manifestResponse: ReplayManifest?
    var snapshotsResponse: [ReplaySnapshot] = []

    func fetchManifest(sessionId: Int) async throws -> ReplayManifest {
        guard let m = manifestResponse else { throw URLError(.badServerResponse) }
        return m
    }
    func fetchSnapshots(sessionId: Int) async throws -> [ReplaySnapshot] {
        snapshotsResponse
    }
}
```

- [ ] **Step 4: Run tests — expect compile failure**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/ReplayStoreTests 2>&1 | tail -15
```

Expected: `ReplayStore`, `ReplayServicing` unknown.

- [ ] **Step 5: `ReplayService`**

Write `BoxBoxNow/BoxBoxNowDashboard/Services/ReplayService.swift`:

```swift
import Foundation

protocol ReplayServicing {
    func fetchManifest(sessionId: Int) async throws -> ReplayManifest
    func fetchSnapshots(sessionId: Int) async throws -> [ReplaySnapshot]
}

final class ReplayService: ReplayServicing {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func fetchManifest(sessionId: Int) async throws -> ReplayManifest {
        try await api.get("/replays/\(sessionId)/manifest")
    }
    func fetchSnapshots(sessionId: Int) async throws -> [ReplaySnapshot] {
        try await api.get("/replays/\(sessionId)/snapshots")
    }
}
```

- [ ] **Step 6: `ReplayStore`**

Write `BoxBoxNow/BoxBoxNowDashboard/Stores/ReplayStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class ReplayStore {
    private let service: ReplayServicing
    init(service: ReplayServicing) { self.service = service }

    var manifest: ReplayManifest? = nil
    var frames: [ReplaySnapshot] = []
    var currentTimeMs: Double = 0
    var isPlaying: Bool = false
    var isLoading: Bool = false
    var lastError: String? = nil
    var playbackSpeed: Double = 1.0

    private var playbackTask: Task<Void, Never>? = nil

    var currentFrame: ReplaySnapshot? {
        frames.min(by: {
            abs($0.elapsedMs - currentTimeMs) < abs($1.elapsedMs - currentTimeMs)
        })
    }

    func load(sessionId: Int) async {
        isLoading = true
        defer { isLoading = false }
        do {
            manifest = try await service.fetchManifest(sessionId: sessionId)
            frames = try await service.fetchSnapshots(sessionId: sessionId)
            currentTimeMs = frames.first?.elapsedMs ?? 0
        } catch {
            lastError = error.localizedDescription
        }
    }

    func seek(to ms: Double) {
        currentTimeMs = min(max(0, ms), manifest?.durationMs ?? ms)
    }

    func play() {
        guard !isPlaying else { return }
        isPlaying = true
        playbackTask = Task { [weak self] in
            guard let self else { return }
            let tickMs: Double = 33
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(tickMs * 1_000_000))
                guard self.isPlaying else { break }
                let next = self.currentTimeMs + tickMs * self.playbackSpeed
                if let dur = self.manifest?.durationMs, next > dur {
                    self.currentTimeMs = dur
                    self.pause()
                    break
                }
                self.currentTimeMs = next
            }
        }
    }

    func pause() {
        isPlaying = false
        playbackTask?.cancel()
        playbackTask = nil
    }
}
```

- [ ] **Step 7: Register store in `AppStore`**

Add the stored property to the `AppStore` class declaration (keep every other store from previous tasks untouched):

```swift
var replay: ReplayStore = ReplayStore(service: ReplayService())
```

If `AppStore` currently has an explicit `init()` that wires services for other stores, add this line inside it as well:

```swift
self.replay = ReplayStore(service: ReplayService())
```

- [ ] **Step 8: Run tests — expect pass**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/ReplayStoreTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 9: Wire + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow

for f in Models/ReplaySnapshot Services/ReplayService Stores/ReplayStore; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done
ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests \
     "BoxBoxNowDashboardTests/Stores/ReplayStoreTests.swift"
ruby ../scripts/xcode/add_resource_to_target.rb BoxBoxNowDashboardTests \
     "BoxBoxNowDashboardTests/Fixtures/replay_snapshot.json"

git add BoxBoxNow/BoxBoxNowDashboard/Models/ReplaySnapshot.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/ReplayService.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/ReplayStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/AppStore.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Stores/ReplayStoreTests.swift \
        BoxBoxNow/BoxBoxNowDashboardTests/Fixtures/replay_snapshot.json \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): replay store + service with TDD"
```

---

### Task 27: Replay module — timeline + playback UI

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayTimelineView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayPlaybackControls.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayKartListView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayView.swift` (replace stub)

- [ ] **Step 1: `ReplayTimelineView` — Canvas-based scrubber**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayTimelineView.swift`:

```swift
import SwiftUI

struct ReplayTimelineView: View {
    let durationMs: Double
    let frames: [ReplaySnapshot]
    @Binding var currentTimeMs: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Canvas { ctx, size in
                    // Background track
                    let rect = CGRect(origin: .zero, size: size)
                    ctx.fill(Path(roundedRect: rect, cornerRadius: 4),
                             with: .color(BBNColors.surface))
                    // Frame ticks
                    for frame in frames {
                        let x = (frame.elapsedMs / max(durationMs, 1)) * size.width
                        let tick = CGRect(x: x - 0.5, y: size.height * 0.2, width: 1, height: size.height * 0.6)
                        ctx.fill(Path(tick), with: .color(BBNColors.border))
                    }
                    // Playhead
                    let px = (currentTimeMs / max(durationMs, 1)) * size.width
                    let head = CGRect(x: px - 1.5, y: 0, width: 3, height: size.height)
                    ctx.fill(Path(head), with: .color(BBNColors.accent))
                }
            }
            .frame(height: 36)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let ratio = max(0, min(1, value.location.x / geo.size.width))
                        currentTimeMs = ratio * durationMs
                    }
            )
        }
        .frame(height: 36)
    }
}
```

- [ ] **Step 2: `ReplayPlaybackControls`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayPlaybackControls.swift`:

```swift
import SwiftUI

struct ReplayPlaybackControls: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        HStack(spacing: 20) {
            Button {
                app.replay.seek(to: 0)
            } label: {
                Image(systemName: "backward.end.fill")
            }
            Button {
                if app.replay.isPlaying { app.replay.pause() } else { app.replay.play() }
            } label: {
                Image(systemName: app.replay.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 24))
            }
            Menu {
                ForEach([0.5, 1.0, 2.0, 4.0], id: \.self) { speed in
                    Button("\(speed, specifier: "%.1f")x") {
                        app.replay.playbackSpeed = speed
                    }
                }
            } label: {
                Text("\(app.replay.playbackSpeed, specifier: "%.1f")x")
                    .font(BBNTypography.body)
            }
            Spacer()
            Text(RaceFormatters.stint(elapsedMs: app.replay.currentTimeMs))
                .font(BBNTypography.body).monospacedDigit()
                .foregroundStyle(BBNColors.textPrimary)
            Text(" / ")
                .foregroundStyle(BBNColors.textMuted)
            Text(RaceFormatters.stint(elapsedMs: app.replay.manifest?.durationMs ?? 0))
                .font(BBNTypography.body).monospacedDigit()
                .foregroundStyle(BBNColors.textMuted)
        }
        .foregroundStyle(BBNColors.accent)
    }
}
```

- [ ] **Step 3: `ReplayKartListView` — live state of the current frame**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayKartListView.swift`:

```swift
import SwiftUI

struct ReplayKartListView: View {
    let frame: ReplaySnapshot?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Estado en t=\(Int((frame?.elapsedMs ?? 0) / 1000)) s")
                .font(BBNTypography.caption)
                .foregroundStyle(BBNColors.textMuted)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            Divider().overlay(BBNColors.border)
            if let karts = frame?.karts, !karts.isEmpty {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(karts.sorted(by: { $0.position < $1.position }), id: \.kartNumber) { k in
                            HStack(spacing: 12) {
                                Text("\(k.position)º")
                                    .font(BBNTypography.bodyBold)
                                    .frame(width: 40, alignment: .leading)
                                KartNumberBadge(number: k.kartNumber, size: 32)
                                Spacer()
                                Text(RaceFormatters.lapTime(ms: k.bestLapMs))
                                    .monospacedDigit()
                                    .foregroundStyle(BBNColors.accent)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .foregroundStyle(BBNColors.textPrimary)
                            Divider().overlay(BBNColors.border.opacity(0.5))
                        }
                    }
                }
            } else {
                PlaceholderView(text: "Sin datos")
            }
        }
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 4: `ReplayView` — top-level**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ReplayView.swift`:

```swift
import SwiftUI

struct ReplayView: View {
    @Environment(AppStore.self) private var app
    @State private var selectedSessionId: Int? = nil

    var body: some View {
        VStack(spacing: 16) {
            header
            if app.replay.isLoading {
                ProgressView().tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if app.replay.manifest == nil {
                PlaceholderView(text: "Selecciona una sesión para cargar el replay")
            } else {
                ReplayKartListView(frame: app.replay.currentFrame)
                ReplayTimelineView(
                    durationMs: app.replay.manifest?.durationMs ?? 0,
                    frames: app.replay.frames,
                    currentTimeMs: Binding(
                        get: { app.replay.currentTimeMs },
                        set: { app.replay.seek(to: $0) }
                    )
                )
                ReplayPlaybackControls()
            }
        }
        .padding(20)
        .background(BBNColors.background)
        .task { await app.config.reloadSessions() }
    }

    private var header: some View {
        HStack {
            Text("Replay").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
            Spacer()
            if !app.config.sessions.isEmpty {
                Picker("Sesión", selection: $selectedSessionId) {
                    Text("—").tag(Int?.none)
                    ForEach(app.config.sessions) { s in
                        Text(s.name).tag(Int?.some(s.id))
                    }
                }
                .tint(BBNColors.accent)
                .onChange(of: selectedSessionId) { _, newValue in
                    if let id = newValue {
                        Task { await app.replay.load(sessionId: id) }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 5: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Features/Replay/ReplayTimelineView Features/Replay/ReplayPlaybackControls Features/Replay/ReplayKartListView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Replay/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): replay module UI (timeline + playback + kart list)"
```

---

### Task 28: Analytics module — kart cards + detail sheet with Swift Charts

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/KartAnalytics.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/AnalyticsService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/AnalyticsStore.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/KartAnalyticsCard.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/KartAnalyticsDetailSheet.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/KartAnalyticsView.swift` (replace stub)

- [ ] **Step 1: Models**

Write `BoxBoxNow/BoxBoxNowDashboard/Models/KartAnalytics.swift`:

```swift
import Foundation

struct KartAnalytics: Codable, Identifiable, Hashable {
    let kartNumber: Int
    let races: Int
    let bestLapMs: Double?
    let avgLapMs: Double?
    let avgTierAdjusted: Double?
    let lapHistory: [LapPoint]
    var id: Int { kartNumber }

    enum CodingKeys: String, CodingKey {
        case kartNumber = "kart_number"
        case races
        case bestLapMs = "best_lap_ms"
        case avgLapMs = "avg_lap_ms"
        case avgTierAdjusted = "avg_tier_adjusted"
        case lapHistory = "lap_history"
    }
}

struct LapPoint: Codable, Hashable, Identifiable {
    let sessionId: Int
    let timestamp: Date
    let lapMs: Double
    var id: String { "\(sessionId)-\(timestamp.timeIntervalSince1970)-\(lapMs)" }

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case timestamp, lapMs = "lap_ms"
    }
}
```

- [ ] **Step 2: Service + store**

Write `BoxBoxNow/BoxBoxNowDashboard/Services/AnalyticsService.swift`:

```swift
import Foundation

protocol AnalyticsServicing {
    func fetchKarts() async throws -> [KartAnalytics]
}

final class AnalyticsService: AnalyticsServicing {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }
    func fetchKarts() async throws -> [KartAnalytics] {
        try await api.get("/analytics/karts")
    }
}
```

Write `BoxBoxNow/BoxBoxNowDashboard/Stores/AnalyticsStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class AnalyticsStore {
    private let service: AnalyticsServicing
    init(service: AnalyticsServicing) { self.service = service }

    var karts: [KartAnalytics] = []
    var isLoading = false
    var lastError: String? = nil

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            karts = try await service.fetchKarts()
        } catch {
            lastError = error.localizedDescription
        }
    }
}
```

Register in `AppStore`:

```swift
var analytics: AnalyticsStore = AnalyticsStore(service: AnalyticsService())
```

- [ ] **Step 3: `KartAnalyticsCard`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/KartAnalyticsCard.swift`:

```swift
import SwiftUI

struct KartAnalyticsCard: View {
    let kart: KartAnalytics
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    KartNumberBadge(number: kart.kartNumber, size: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(kart.races) carreras").font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                        Text(RaceFormatters.lapTime(ms: kart.bestLapMs))
                            .font(BBNTypography.title3)
                            .foregroundStyle(BBNColors.accent)
                    }
                    Spacer()
                }
                HStack(spacing: 12) {
                    metric("Promedio", value: RaceFormatters.lapTime(ms: kart.avgLapMs))
                    metric("Tier ajust.", value: RaceFormatters.lapTime(ms: kart.avgTierAdjusted))
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BBNColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func metric(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
            Text(value).font(BBNTypography.body).monospacedDigit()
                .foregroundStyle(BBNColors.textPrimary)
        }
    }
}
```

- [ ] **Step 4: `KartAnalyticsDetailSheet` with Swift Charts**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/KartAnalyticsDetailSheet.swift`:

```swift
import SwiftUI
import Charts

struct KartAnalyticsDetailSheet: View {
    let kart: KartAnalytics
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    lapsChart
                    distributionChart
                }
                .padding(20)
            }
            .background(BBNColors.background.ignoresSafeArea())
            .navigationTitle("Kart \(kart.kartNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }.tint(BBNColors.accent)
                }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 16) {
            KartNumberBadge(number: kart.kartNumber, size: 64)
            VStack(alignment: .leading, spacing: 4) {
                Text("Mejor \(RaceFormatters.lapTime(ms: kart.bestLapMs))")
                    .font(BBNTypography.title3).foregroundStyle(BBNColors.accent)
                Text("Promedio \(RaceFormatters.lapTime(ms: kart.avgLapMs))")
                    .font(BBNTypography.body).foregroundStyle(BBNColors.textMuted)
                Text("\(kart.races) carreras registradas")
                    .font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
            }
        }
    }

    private var lapsChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Evolución de mejor vuelta")
                .font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
            Chart(kart.lapHistory) { point in
                LineMark(
                    x: .value("Fecha", point.timestamp),
                    y: .value("Tiempo (ms)", point.lapMs)
                )
                .foregroundStyle(BBNColors.accent)
                PointMark(
                    x: .value("Fecha", point.timestamp),
                    y: .value("Tiempo (ms)", point.lapMs)
                )
                .foregroundStyle(BBNColors.accent)
                .symbolSize(30)
            }
            .frame(height: 220)
            .chartYAxis {
                AxisMarks(values: .automatic) { value in
                    AxisGridLine().foregroundStyle(BBNColors.border)
                    AxisValueLabel {
                        if let v = value.as(Double.self) {
                            Text(RaceFormatters.lapTime(ms: v))
                                .foregroundStyle(BBNColors.textMuted)
                        }
                    }
                }
            }
            .chartXAxis {
                AxisMarks { _ in
                    AxisGridLine().foregroundStyle(BBNColors.border)
                    AxisValueLabel().foregroundStyle(BBNColors.textMuted)
                }
            }
            .padding(12)
            .background(BBNColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var distributionChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Distribución de tiempos")
                .font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
            Chart(bucketed) { bucket in
                BarMark(
                    x: .value("Tiempo", bucket.label),
                    y: .value("Vueltas", bucket.count)
                )
                .foregroundStyle(BBNColors.accent.opacity(0.7))
            }
            .frame(height: 180)
            .padding(12)
            .background(BBNColors.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var bucketed: [HistoBucket] {
        guard !kart.lapHistory.isEmpty else { return [] }
        let sorted = kart.lapHistory.map(\.lapMs).sorted()
        guard let minV = sorted.first, let maxV = sorted.last, maxV > minV else { return [] }
        let bucketCount = 10
        let width = (maxV - minV) / Double(bucketCount)
        var buckets = Array(repeating: 0, count: bucketCount)
        for value in sorted {
            let idx = min(Int((value - minV) / width), bucketCount - 1)
            buckets[idx] += 1
        }
        return buckets.enumerated().map { idx, count in
            let lo = minV + width * Double(idx)
            return HistoBucket(label: String(format: "%.1f", lo / 1000), count: count)
        }
    }

    private struct HistoBucket: Identifiable {
        let label: String
        let count: Int
        var id: String { label }
    }
}
```

- [ ] **Step 5: `KartAnalyticsView`**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/KartAnalyticsView.swift`:

```swift
import SwiftUI

struct KartAnalyticsView: View {
    @Environment(AppStore.self) private var app
    @State private var selected: KartAnalytics? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Karts").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
                Spacer()
                Button {
                    Task { await app.analytics.reload() }
                } label: {
                    Image(systemName: "arrow.clockwise").foregroundStyle(BBNColors.accent)
                }
            }
            .padding(20)
            .background(BBNColors.surface)

            if app.analytics.isLoading {
                ProgressView().tint(BBNColors.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if app.analytics.karts.isEmpty {
                PlaceholderView(text: "Sin datos de analytics")
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 16)], spacing: 16) {
                        ForEach(app.analytics.karts) { kart in
                            KartAnalyticsCard(kart: kart) { selected = kart }
                        }
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task { await app.analytics.reload() }
        .sheet(item: $selected) { kart in
            KartAnalyticsDetailSheet(kart: kart)
        }
    }
}
```

- [ ] **Step 6: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Models/KartAnalytics Services/AnalyticsService Stores/AnalyticsStore \
         Features/Analytics/KartAnalyticsCard Features/Analytics/KartAnalyticsDetailSheet; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Models/KartAnalytics.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/AnalyticsService.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/AnalyticsStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/AppStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Features/Analytics/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): analytics module (kart cards + charts detail)"
```

---

### Task 29: GPS Insights module — trajectory, speed trace, g-force

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/GPSInsight.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/InsightsService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/InsightsStore.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/TrajectoryMapView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/SpeedTraceView.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/GForceScatterView.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/InsightsView.swift` (replace stub)
- Test:   `BoxBoxNow/BoxBoxNowDashboardTests/Features/Insights/GPSGeometryTests.swift`

- [ ] **Step 1: Models**

Write `BoxBoxNow/BoxBoxNowDashboard/Models/GPSInsight.swift`:

```swift
import Foundation

struct GPSLap: Codable, Identifiable, Hashable {
    let id: Int
    let kartNumber: Int
    let lapIndex: Int
    let lapMs: Double
    let samples: [GPSSamplePoint]

    enum CodingKeys: String, CodingKey {
        case id, kartNumber = "kart_number", lapIndex = "lap_index",
             lapMs = "lap_ms", samples
    }
}

struct GPSSamplePoint: Codable, Hashable {
    let timestamp: Double
    let lat: Double
    let lon: Double
    let speedKmh: Double
    let accelerationG: Double
    let lateralG: Double

    enum CodingKeys: String, CodingKey {
        case timestamp, lat, lon
        case speedKmh = "speed_kmh"
        case accelerationG = "acceleration_g"
        case lateralG = "lateral_g"
    }
}
```

- [ ] **Step 2: Failing tests for GPS geometry helpers**

Write `BoxBoxNow/BoxBoxNowDashboardTests/Features/Insights/GPSGeometryTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

final class GPSGeometryTests: XCTestCase {

    func test_normalizePoints_fits_into_unit_rect() {
        let samples = [
            GPSSamplePoint(timestamp: 0, lat: 40.0, lon: -3.0, speedKmh: 0, accelerationG: 0, lateralG: 0),
            GPSSamplePoint(timestamp: 1, lat: 40.1, lon: -2.9, speedKmh: 0, accelerationG: 0, lateralG: 0),
            GPSSamplePoint(timestamp: 2, lat: 40.2, lon: -2.8, speedKmh: 0, accelerationG: 0, lateralG: 0)
        ]
        let points = GPSGeometry.normalize(samples)
        XCTAssertEqual(points.count, 3)
        for p in points {
            XCTAssertGreaterThanOrEqual(p.x, 0)
            XCTAssertLessThanOrEqual(p.x, 1)
            XCTAssertGreaterThanOrEqual(p.y, 0)
            XCTAssertLessThanOrEqual(p.y, 1)
        }
    }

    func test_speedColor_maps_0_to_blue_and_max_to_red() {
        let cool = GPSGeometry.speedColor(0, minSpeed: 0, maxSpeed: 100)
        let hot  = GPSGeometry.speedColor(100, minSpeed: 0, maxSpeed: 100)
        XCTAssertEqual(cool, .blue)
        XCTAssertEqual(hot, .red)
    }
}
```

- [ ] **Step 3: Run tests — expect compile failure**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/GPSGeometryTests 2>&1 | tail -15
```

Expected: `GPSGeometry` unknown.

- [ ] **Step 4: Implement `GPSGeometry`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/GPSGeometry.swift`:

```swift
import SwiftUI

enum GPSGeometry {
    struct NormalizedPoint {
        let x: Double
        let y: Double
    }

    /// Rescale lat/lon samples to a 0...1 x 0...1 box preserving aspect ratio.
    static func normalize(_ samples: [GPSSamplePoint]) -> [NormalizedPoint] {
        guard let minLat = samples.map(\.lat).min(),
              let maxLat = samples.map(\.lat).max(),
              let minLon = samples.map(\.lon).min(),
              let maxLon = samples.map(\.lon).max() else {
            return []
        }
        let rangeLat = max(maxLat - minLat, .ulpOfOne)
        let rangeLon = max(maxLon - minLon, .ulpOfOne)
        return samples.map { s in
            NormalizedPoint(
                x: (s.lon - minLon) / rangeLon,
                y: 1 - (s.lat - minLat) / rangeLat // invert Y so north is up
            )
        }
    }

    /// Simple blue → yellow → red gradient for speed heatmaps.
    static func speedColor(_ speed: Double, minSpeed: Double, maxSpeed: Double) -> Color {
        let range = max(maxSpeed - minSpeed, .ulpOfOne)
        let t = max(0, min(1, (speed - minSpeed) / range))
        switch t {
        case 0: return .blue
        case 1: return .red
        case ..<0.5:
            return Color(red: t * 2, green: t * 2, blue: 1 - t * 2)
        default:
            return Color(red: 1, green: 2 - t * 2, blue: 0)
        }
    }
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/GPSGeometryTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 6: Service + store**

Write `BoxBoxNow/BoxBoxNowDashboard/Services/InsightsService.swift`:

```swift
import Foundation

protocol InsightsServicing {
    func fetchLaps(sessionId: Int) async throws -> [GPSLap]
}

final class InsightsService: InsightsServicing {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }
    func fetchLaps(sessionId: Int) async throws -> [GPSLap] {
        try await api.get("/gps/sessions/\(sessionId)/laps")
    }
}
```

Write `BoxBoxNow/BoxBoxNowDashboard/Stores/InsightsStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class InsightsStore {
    private let service: InsightsServicing
    init(service: InsightsServicing) { self.service = service }

    var laps: [GPSLap] = []
    var selectedLapId: Int? = nil
    var isLoading = false
    var lastError: String? = nil

    var selectedLap: GPSLap? {
        guard let id = selectedLapId else { return nil }
        return laps.first { $0.id == id }
    }

    func reload(sessionId: Int) async {
        isLoading = true
        defer { isLoading = false }
        do {
            laps = try await service.fetchLaps(sessionId: sessionId)
            selectedLapId = laps.first?.id
        } catch {
            lastError = error.localizedDescription
        }
    }
}
```

Register in `AppStore`:

```swift
var insights: InsightsStore = InsightsStore(service: InsightsService())
```

- [ ] **Step 7: `TrajectoryMapView` — canvas of the lap path coloured by speed**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/TrajectoryMapView.swift`:

```swift
import SwiftUI

struct TrajectoryMapView: View {
    let lap: GPSLap?

    var body: some View {
        Canvas { ctx, size in
            guard let samples = lap?.samples, samples.count > 1 else { return }
            let points = GPSGeometry.normalize(samples)
            let minSpeed = samples.map(\.speedKmh).min() ?? 0
            let maxSpeed = samples.map(\.speedKmh).max() ?? 100

            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 20, dy: 20)

            for i in 1..<points.count {
                let a = points[i - 1]
                let b = points[i]
                let aPt = CGPoint(x: rect.minX + a.x * rect.width, y: rect.minY + a.y * rect.height)
                let bPt = CGPoint(x: rect.minX + b.x * rect.width, y: rect.minY + b.y * rect.height)

                var path = Path()
                path.move(to: aPt)
                path.addLine(to: bPt)
                let color = GPSGeometry.speedColor(samples[i].speedKmh,
                                                   minSpeed: minSpeed,
                                                   maxSpeed: maxSpeed)
                ctx.stroke(path, with: .color(color), lineWidth: 4)
            }
        }
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 8: `SpeedTraceView` — speed vs time**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/SpeedTraceView.swift`:

```swift
import SwiftUI
import Charts

struct SpeedTraceView: View {
    let lap: GPSLap?

    var body: some View {
        Chart {
            if let samples = lap?.samples {
                ForEach(Array(samples.enumerated()), id: \.offset) { idx, s in
                    LineMark(
                        x: .value("t", s.timestamp),
                        y: .value("km/h", s.speedKmh)
                    )
                    .foregroundStyle(BBNColors.accent)
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisGridLine().foregroundStyle(BBNColors.border)
                AxisValueLabel().foregroundStyle(BBNColors.textMuted)
            }
        }
        .chartXAxis {
            AxisMarks { _ in
                AxisGridLine().foregroundStyle(BBNColors.border)
                AxisValueLabel().foregroundStyle(BBNColors.textMuted)
            }
        }
        .frame(height: 180)
        .padding(12)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 9: `GForceScatterView` — longitudinal vs lateral G**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/GForceScatterView.swift`:

```swift
import SwiftUI
import Charts

struct GForceScatterView: View {
    let lap: GPSLap?

    var body: some View {
        Chart {
            if let samples = lap?.samples {
                ForEach(Array(samples.enumerated()), id: \.offset) { _, s in
                    PointMark(
                        x: .value("Lat G", s.lateralG),
                        y: .value("Long G", s.accelerationG)
                    )
                    .foregroundStyle(BBNColors.accent.opacity(0.6))
                    .symbolSize(20)
                }
            }
        }
        .chartXScale(domain: -2.0...2.0)
        .chartYScale(domain: -2.0...2.0)
        .chartYAxis {
            AxisMarks(position: .leading) { _ in
                AxisGridLine().foregroundStyle(BBNColors.border)
                AxisValueLabel().foregroundStyle(BBNColors.textMuted)
            }
        }
        .chartXAxis {
            AxisMarks { _ in
                AxisGridLine().foregroundStyle(BBNColors.border)
                AxisValueLabel().foregroundStyle(BBNColors.textMuted)
            }
        }
        .frame(height: 220)
        .padding(12)
        .background(BBNColors.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

- [ ] **Step 10: `InsightsView` — ties everything together**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Insights/InsightsView.swift`:

```swift
import SwiftUI

struct InsightsView: View {
    @Environment(AppStore.self) private var app
    @State private var sessionId: Int? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if sessionId == nil {
                PlaceholderView(text: "Selecciona una sesión")
            } else if app.insights.isLoading {
                ProgressView().tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if app.insights.laps.isEmpty {
                PlaceholderView(text: "Sin datos GPS para esta sesión")
            } else {
                ScrollView {
                    VStack(spacing: 20) {
                        lapPicker
                        HStack(alignment: .top, spacing: 20) {
                            TrajectoryMapView(lap: app.insights.selectedLap)
                                .frame(height: 340)
                                .frame(maxWidth: .infinity)
                            VStack(spacing: 16) {
                                SpeedTraceView(lap: app.insights.selectedLap)
                                GForceScatterView(lap: app.insights.selectedLap)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task {
            await app.config.reloadSessions()
            sessionId = app.config.sessions.first?.id
            if let id = sessionId { await app.insights.reload(sessionId: id) }
        }
    }

    private var header: some View {
        HStack {
            Text("GPS Insights").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
            Spacer()
            if !app.config.sessions.isEmpty {
                Picker("Sesión", selection: Binding(
                    get: { sessionId ?? 0 },
                    set: { newValue in
                        sessionId = newValue
                        Task { await app.insights.reload(sessionId: newValue) }
                    }
                )) {
                    ForEach(app.config.sessions) { s in
                        Text(s.name).tag(s.id)
                    }
                }
                .tint(BBNColors.accent)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
    }

    private var lapPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(app.insights.laps) { lap in
                    Button {
                        app.insights.selectedLapId = lap.id
                    } label: {
                        VStack(spacing: 2) {
                            Text("Vuelta \(lap.lapIndex)")
                                .font(BBNTypography.caption)
                            Text(RaceFormatters.lapTime(ms: lap.lapMs))
                                .font(BBNTypography.bodyBold)
                                .monospacedDigit()
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(
                            app.insights.selectedLapId == lap.id
                                ? BBNColors.accent.opacity(0.2)
                                : BBNColors.surface
                        )
                        .foregroundStyle(
                            app.insights.selectedLapId == lap.id
                                ? BBNColors.accent
                                : BBNColors.textPrimary
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
```

- [ ] **Step 11: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Models/GPSInsight Services/InsightsService Stores/InsightsStore \
         Features/Insights/GPSGeometry Features/Insights/TrajectoryMapView \
         Features/Insights/SpeedTraceView Features/Insights/GForceScatterView; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done
ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests \
     "BoxBoxNowDashboardTests/Features/Insights/GPSGeometryTests.swift"

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/GPSGeometryTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Models/GPSInsight.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/InsightsService.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/InsightsStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/AppStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Features/Insights/ \
        BoxBoxNow/BoxBoxNowDashboardTests/Features/Insights/GPSGeometryTests.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): insights module (trajectory + speed + g-force)"
```

**End of Phase C.** Analysis & replay is complete. The last area remaining is the Admin suite.

---

## Phase D — Admin suite

Delivers the four admin-only modules: Users, Circuits (read-only across orgs), Circuit Hub, and Platform metrics. All require `is_admin == true` AND the corresponding `admin-*` tab slug, which the sidebar already filters on.


### Task 30: Admin Users module

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboard/Services/AdminService.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Stores/AdminStore.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Models/AdminModels.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/Users/UserDetailSheet.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/Users/UserTabsEditor.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminUsersView.swift` (replace stub)
- Test:   `BoxBoxNow/BoxBoxNowDashboardTests/Stores/AdminStoreTests.swift`

- [ ] **Step 1: Admin models**

Write `BoxBoxNow/BoxBoxNowDashboard/Models/AdminModels.swift`:

```swift
import Foundation

struct UserListItem: Codable, Identifiable, Hashable {
    let id: Int
    let username: String
    let email: String
    let isAdmin: Bool
    let tabAccess: [String]
    let hasActiveSubscription: Bool
    let subscriptionPlan: String?
    let subscriptionStatus: String?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, username, email
        case isAdmin = "is_admin"
        case tabAccess = "tab_access"
        case hasActiveSubscription = "has_active_subscription"
        case subscriptionPlan = "subscription_plan"
        case subscriptionStatus = "subscription_status"
        case createdAt = "created_at"
    }
}

struct UserPatch: Codable {
    var tabAccess: [String]?
    var isAdmin: Bool?

    enum CodingKeys: String, CodingKey {
        case tabAccess = "tab_access"
        case isAdmin = "is_admin"
    }
}

struct AdminCircuit: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let lengthM: Int
    let ownerEmail: String
    let isActive: Bool

    enum CodingKeys: String, CodingKey {
        case id, name
        case lengthM = "length_m"
        case ownerEmail = "owner_email"
        case isActive = "is_active"
    }
}

struct CircuitHubEntry: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let country: String?
    let city: String?
    let lengthM: Int
    let difficulty: Int?
    let rating: Double?

    enum CodingKeys: String, CodingKey {
        case id, name, country, city
        case lengthM = "length_m"
        case difficulty
        case rating
    }
}

struct PlatformMetrics: Codable, Hashable {
    let totalUsers: Int
    let paidUsers: Int
    let totalSessions: Int
    let monthlyRevenueCents: Int
    let signupTrend: [MetricPoint]
    let revenueTrend: [MetricPoint]

    enum CodingKeys: String, CodingKey {
        case totalUsers = "total_users"
        case paidUsers = "paid_users"
        case totalSessions = "total_sessions"
        case monthlyRevenueCents = "monthly_revenue_cents"
        case signupTrend = "signup_trend"
        case revenueTrend = "revenue_trend"
    }
}

struct MetricPoint: Codable, Hashable, Identifiable {
    let date: Date
    let value: Double
    var id: Date { date }
}
```

- [ ] **Step 2: Failing test for `AdminStore`**

Write `BoxBoxNow/BoxBoxNowDashboardTests/Stores/AdminStoreTests.swift`:

```swift
import XCTest
@testable import BoxBoxNowDashboard

@MainActor
final class AdminStoreTests: XCTestCase {

    func test_reloadUsers_populates_list() async {
        let mock = MockAdminService()
        mock.usersResponse = [
            UserListItem(
                id: 1, username: "alice", email: "a@x", isAdmin: false,
                tabAccess: ["race"], hasActiveSubscription: true,
                subscriptionPlan: "pro", subscriptionStatus: "active", createdAt: nil
            )
        ]
        let store = AdminStore(service: mock)
        await store.reloadUsers()
        XCTAssertEqual(store.users.count, 1)
        XCTAssertEqual(store.users.first?.username, "alice")
    }

    func test_updateUser_sends_patch_and_reloads() async {
        let mock = MockAdminService()
        mock.updateUserResponse = UserListItem(
            id: 1, username: "alice", email: "a@x", isAdmin: false,
            tabAccess: ["race", "pit"], hasActiveSubscription: true,
            subscriptionPlan: "pro", subscriptionStatus: "active", createdAt: nil
        )
        let store = AdminStore(service: mock)
        let ok = await store.updateUser(id: 1, patch: UserPatch(tabAccess: ["race", "pit"], isAdmin: nil))
        XCTAssertTrue(ok)
        XCTAssertEqual(mock.updateUserCalls, 1)
        XCTAssertEqual(mock.fetchUsersCalls, 1)
    }
}

final class MockAdminService: AdminServicing {
    var usersResponse: [UserListItem] = []
    var updateUserResponse: UserListItem? = nil
    var circuitsResponse: [AdminCircuit] = []
    var hubResponse: [CircuitHubEntry] = []
    var metricsResponse: PlatformMetrics? = nil

    var fetchUsersCalls = 0
    var updateUserCalls = 0

    func fetchUsers() async throws -> [UserListItem] {
        fetchUsersCalls += 1
        return usersResponse
    }
    func updateUser(id: Int, patch: UserPatch) async throws -> UserListItem {
        updateUserCalls += 1
        return updateUserResponse ?? usersResponse.first!
    }
    func deleteUser(id: Int) async throws {}
    func fetchCircuits() async throws -> [AdminCircuit] { circuitsResponse }
    func fetchHubCircuits() async throws -> [CircuitHubEntry] { hubResponse }
    func fetchPlatformMetrics() async throws -> PlatformMetrics {
        guard let m = metricsResponse else { throw URLError(.badServerResponse) }
        return m
    }
}
```

- [ ] **Step 3: Run — expect compile failure**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/AdminStoreTests 2>&1 | tail -15
```

Expected: `AdminServicing`, `AdminStore` unknown.

- [ ] **Step 4: `AdminService`**

Write `BoxBoxNow/BoxBoxNowDashboard/Services/AdminService.swift`:

```swift
import Foundation

protocol AdminServicing {
    func fetchUsers() async throws -> [UserListItem]
    func updateUser(id: Int, patch: UserPatch) async throws -> UserListItem
    func deleteUser(id: Int) async throws
    func fetchCircuits() async throws -> [AdminCircuit]
    func fetchHubCircuits() async throws -> [CircuitHubEntry]
    func fetchPlatformMetrics() async throws -> PlatformMetrics
}

final class AdminService: AdminServicing {
    private let api: APIClient
    init(api: APIClient = .shared) { self.api = api }

    func fetchUsers() async throws -> [UserListItem] {
        try await api.get("/admin/users")
    }
    func updateUser(id: Int, patch: UserPatch) async throws -> UserListItem {
        try await api.patch("/admin/users/\(id)", body: patch)
    }
    func deleteUser(id: Int) async throws {
        try await api.delete("/admin/users/\(id)")
    }
    func fetchCircuits() async throws -> [AdminCircuit] {
        try await api.get("/admin/circuits")
    }
    func fetchHubCircuits() async throws -> [CircuitHubEntry] {
        try await api.get("/admin/circuit-hub")
    }
    func fetchPlatformMetrics() async throws -> PlatformMetrics {
        try await api.get("/admin/metrics")
    }
}
```

- [ ] **Step 5: `AdminStore`**

Write `BoxBoxNow/BoxBoxNowDashboard/Stores/AdminStore.swift`:

```swift
import Foundation
import Observation

@Observable
@MainActor
final class AdminStore {
    private let service: AdminServicing
    init(service: AdminServicing) { self.service = service }

    var users: [UserListItem] = []
    var circuits: [AdminCircuit] = []
    var hubCircuits: [CircuitHubEntry] = []
    var metrics: PlatformMetrics? = nil
    var isLoading = false
    var lastError: String? = nil

    func reloadUsers() async {
        isLoading = true
        defer { isLoading = false }
        do { users = try await service.fetchUsers() }
        catch { lastError = error.localizedDescription }
    }

    func updateUser(id: Int, patch: UserPatch) async -> Bool {
        do {
            _ = try await service.updateUser(id: id, patch: patch)
            await reloadUsers()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func deleteUser(id: Int) async -> Bool {
        do {
            try await service.deleteUser(id: id)
            await reloadUsers()
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func reloadCircuits() async {
        isLoading = true
        defer { isLoading = false }
        do { circuits = try await service.fetchCircuits() }
        catch { lastError = error.localizedDescription }
    }

    func reloadHub() async {
        isLoading = true
        defer { isLoading = false }
        do { hubCircuits = try await service.fetchHubCircuits() }
        catch { lastError = error.localizedDescription }
    }

    func reloadMetrics() async {
        isLoading = true
        defer { isLoading = false }
        do { metrics = try await service.fetchPlatformMetrics() }
        catch { lastError = error.localizedDescription }
    }
}
```

Register in `AppStore`:

```swift
var admin: AdminStore = AdminStore(service: AdminService())
```

- [ ] **Step 6: Run — expect pass**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/AdminStoreTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 7: `UserTabsEditor`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/Users/UserTabsEditor.swift`:

```swift
import SwiftUI

struct UserTabsEditor: View {
    @Binding var selected: Set<String>
    let isAdminTarget: Bool

    private var regularTabs: [SidebarItem] {
        SidebarItem.allCases.filter { !$0.requiresAdmin }
    }
    private var adminTabs: [SidebarItem] {
        SidebarItem.allCases.filter { $0.requiresAdmin }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Tabs").font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
            VStack(alignment: .leading, spacing: 6) {
                ForEach(regularTabs) { item in
                    toggle(for: item)
                }
            }
            if isAdminTarget {
                Text("Tabs admin").font(BBNTypography.caption)
                    .foregroundStyle(BBNColors.textMuted).padding(.top, 8)
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(adminTabs) { item in
                        toggle(for: item)
                    }
                }
            }
        }
    }

    private func toggle(for item: SidebarItem) -> some View {
        Toggle(isOn: Binding(
            get: { selected.contains(item.tabSlug) },
            set: { newValue in
                if newValue { selected.insert(item.tabSlug) }
                else { selected.remove(item.tabSlug) }
            }
        )) {
            Label(item.title, systemImage: item.systemIcon)
                .foregroundStyle(BBNColors.textPrimary)
        }
        .tint(BBNColors.accent)
    }
}
```

- [ ] **Step 8: `UserDetailSheet`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/Users/UserDetailSheet.swift`:

```swift
import SwiftUI

struct UserDetailSheet: View {
    let user: UserListItem
    @Environment(\.dismiss) private var dismiss
    @Environment(AppStore.self) private var app

    @State private var selectedTabs: Set<String> = []
    @State private var isAdminLocal: Bool = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Información") {
                    LabeledContent("Usuario", value: user.username)
                    LabeledContent("Email", value: user.email)
                    LabeledContent("Plan", value: user.subscriptionPlan ?? "—")
                    LabeledContent("Estado", value: user.subscriptionStatus ?? "—")
                }
                Section {
                    Toggle("Administrador", isOn: $isAdminLocal).tint(BBNColors.accent)
                }
                Section("Permisos") {
                    UserTabsEditor(selected: $selectedTabs, isAdminTarget: isAdminLocal)
                }
            }
            .scrollContentBackground(.hidden)
            .background(BBNColors.background)
            .navigationTitle(user.username)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") { Task { await save() } }.disabled(saving)
                }
            }
            .task {
                selectedTabs = Set(user.tabAccess)
                isAdminLocal = user.isAdmin
            }
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        let patch = UserPatch(
            tabAccess: Array(selectedTabs).sorted(),
            isAdmin: isAdminLocal
        )
        let ok = await app.admin.updateUser(id: user.id, patch: patch)
        if ok { dismiss() }
    }
}
```

- [ ] **Step 9: `AdminUsersView`**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminUsersView.swift`:

```swift
import SwiftUI

struct AdminUsersView: View {
    @Environment(AppStore.self) private var app
    @State private var filter = ""
    @State private var selected: UserListItem? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if app.admin.isLoading {
                ProgressView().tint(BBNColors.accent).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredUsers.isEmpty {
                PlaceholderView(text: "Sin usuarios")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(filteredUsers) { user in
                            userCard(user)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task { await app.admin.reloadUsers() }
        .sheet(item: $selected) { user in
            UserDetailSheet(user: user)
        }
    }

    private var header: some View {
        HStack {
            Text("Usuarios").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
            Spacer()
            TextField("Buscar", text: $filter)
                .textFieldStyle(.roundedBorder)
                .frame(width: 240)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(BBNColors.surface)
    }

    private var filteredUsers: [UserListItem] {
        if filter.isEmpty { return app.admin.users }
        return app.admin.users.filter {
            $0.username.localizedCaseInsensitiveContains(filter) ||
            $0.email.localizedCaseInsensitiveContains(filter)
        }
    }

    private func userCard(_ user: UserListItem) -> some View {
        Button {
            selected = user
        } label: {
            BBNCard {
                HStack(spacing: 12) {
                    Image(systemName: user.isAdmin ? "person.fill.badge.plus" : "person.fill")
                        .font(.title2)
                        .foregroundStyle(user.isAdmin ? BBNColors.accent : BBNColors.textMuted)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.username).font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                        Text(user.email).font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(user.subscriptionPlan ?? "free")
                            .font(BBNTypography.caption)
                            .foregroundStyle(user.hasActiveSubscription ? BBNColors.accent : BBNColors.textMuted)
                        Text("\(user.tabAccess.count) tabs")
                            .font(BBNTypography.caption)
                            .foregroundStyle(BBNColors.textMuted)
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}
```

- [ ] **Step 10: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
for f in Models/AdminModels Services/AdminService Stores/AdminStore \
         Features/Admin/Users/UserTabsEditor Features/Admin/Users/UserDetailSheet; do
  ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard "BoxBoxNowDashboard/${f}.swift"
done
ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardTests \
     "BoxBoxNowDashboardTests/Stores/AdminStoreTests.swift"

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardTests/AdminStoreTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Models/AdminModels.swift \
        BoxBoxNow/BoxBoxNowDashboard/Services/AdminService.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/AdminStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Stores/AppStore.swift \
        BoxBoxNow/BoxBoxNowDashboard/Features/Admin/ \
        BoxBoxNow/BoxBoxNowDashboardTests/Stores/AdminStoreTests.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): admin users module + admin service/store"
```

---

### Task 31: Admin Circuits + Circuit Hub modules

**Files:**
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminCircuitsView.swift` (replace stub)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminHubView.swift` (replace stub)

- [ ] **Step 1: `AdminCircuitsView` — cross-org circuit listing**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminCircuitsView.swift`:

```swift
import SwiftUI

struct AdminCircuitsView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Circuitos (global)").font(BBNTypography.title2)
                    .foregroundStyle(BBNColors.textPrimary)
                Spacer()
                Button { Task { await app.admin.reloadCircuits() } } label: {
                    Image(systemName: "arrow.clockwise").foregroundStyle(BBNColors.accent)
                }
            }
            .padding(20)
            .background(BBNColors.surface)

            if app.admin.isLoading {
                ProgressView().tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if app.admin.circuits.isEmpty {
                PlaceholderView(text: "Sin circuitos")
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(app.admin.circuits) { circuit in
                            BBNCard {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(circuit.name).font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                                        Text("Propietario: \(circuit.ownerEmail)")
                                            .font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 4) {
                                        Text("\(circuit.lengthM) m")
                                            .font(BBNTypography.body)
                                            .foregroundStyle(BBNColors.textPrimary)
                                        if circuit.isActive {
                                            Text("ACTIVO")
                                                .font(BBNTypography.caption)
                                                .foregroundStyle(BBNColors.accent)
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background(BBNColors.accent.opacity(0.1))
                                                .clipShape(Capsule())
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task { await app.admin.reloadCircuits() }
    }
}
```

- [ ] **Step 2: `AdminHubView` — public circuit hub**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminHubView.swift`:

```swift
import SwiftUI

struct AdminHubView: View {
    @Environment(AppStore.self) private var app
    @State private var filter = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            if app.admin.isLoading {
                ProgressView().tint(BBNColors.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filteredHub.isEmpty {
                PlaceholderView(text: "Sin circuitos en el hub")
            } else {
                ScrollView {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 260), spacing: 16)],
                        spacing: 16
                    ) {
                        ForEach(filteredHub) { entry in
                            circuitCard(entry)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .background(BBNColors.background)
        .task { await app.admin.reloadHub() }
    }

    private var header: some View {
        HStack {
            Text("Circuit Hub").font(BBNTypography.title2).foregroundStyle(BBNColors.textPrimary)
            Spacer()
            TextField("Buscar", text: $filter)
                .textFieldStyle(.roundedBorder)
                .frame(width: 240)
        }
        .padding(20)
        .background(BBNColors.surface)
    }

    private var filteredHub: [CircuitHubEntry] {
        if filter.isEmpty { return app.admin.hubCircuits }
        return app.admin.hubCircuits.filter {
            $0.name.localizedCaseInsensitiveContains(filter) ||
            ($0.city ?? "").localizedCaseInsensitiveContains(filter)
        }
    }

    private func circuitCard(_ entry: CircuitHubEntry) -> some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(entry.name).font(BBNTypography.title3).foregroundStyle(BBNColors.textPrimary)
                if let city = entry.city {
                    Text("\(city)\(entry.country.map { ", \($0)" } ?? "")")
                        .font(BBNTypography.caption).foregroundStyle(BBNColors.textMuted)
                }
                HStack(spacing: 12) {
                    Label("\(entry.lengthM) m", systemImage: "ruler")
                        .font(BBNTypography.caption)
                    if let diff = entry.difficulty {
                        Label("\(diff)/5", systemImage: "bolt")
                            .font(BBNTypography.caption)
                    }
                    if let rating = entry.rating {
                        Label(String(format: "%.1f", rating), systemImage: "star.fill")
                            .font(BBNTypography.caption)
                    }
                }
                .foregroundStyle(BBNColors.textMuted)
            }
        }
    }
}
```

- [ ] **Step 3: Build + commit**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminCircuitsView.swift \
        BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminHubView.swift
git commit -m "feat(ipad): admin circuits + circuit hub modules"
```

---

### Task 32: Admin Platform metrics module with Swift Charts

**Files:**
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminPlatformView.swift` (replace stub)
- Create: `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/Platform/MetricTrendCard.swift`

- [ ] **Step 1: `MetricTrendCard`**

Write `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/Platform/MetricTrendCard.swift`:

```swift
import SwiftUI
import Charts

struct MetricTrendCard: View {
    let title: String
    let points: [MetricPoint]
    let valueFormat: (Double) -> String

    var body: some View {
        BBNCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(title)
                        .font(BBNTypography.caption)
                        .foregroundStyle(BBNColors.textMuted)
                    Spacer()
                    if let last = points.last {
                        Text(valueFormat(last.value))
                            .font(BBNTypography.title3)
                            .foregroundStyle(BBNColors.accent)
                    }
                }
                Chart(points) { point in
                    AreaMark(
                        x: .value("Fecha", point.date),
                        y: .value("Valor", point.value)
                    )
                    .foregroundStyle(LinearGradient(
                        colors: [BBNColors.accent.opacity(0.4), BBNColors.accent.opacity(0.02)],
                        startPoint: .top,
                        endPoint: .bottom
                    ))
                    LineMark(
                        x: .value("Fecha", point.date),
                        y: .value("Valor", point.value)
                    )
                    .foregroundStyle(BBNColors.accent)
                }
                .frame(height: 140)
                .chartYAxis {
                    AxisMarks(position: .leading) { _ in
                        AxisGridLine().foregroundStyle(BBNColors.border)
                        AxisValueLabel().foregroundStyle(BBNColors.textMuted)
                    }
                }
                .chartXAxis {
                    AxisMarks { _ in
                        AxisGridLine().foregroundStyle(BBNColors.border)
                        AxisValueLabel().foregroundStyle(BBNColors.textMuted)
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: `AdminPlatformView`**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminPlatformView.swift`:

```swift
import SwiftUI

struct AdminPlatformView: View {
    @Environment(AppStore.self) private var app

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if let metrics = app.admin.metrics {
                    headerCards(metrics)
                    trendCards(metrics)
                } else if app.admin.isLoading {
                    ProgressView().tint(BBNColors.accent).padding(40)
                } else {
                    PlaceholderView(text: "Sin métricas")
                }
            }
            .padding(20)
        }
        .background(BBNColors.background)
        .task { await app.admin.reloadMetrics() }
    }

    private func headerCards(_ metrics: PlatformMetrics) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible()),
                      GridItem(.flexible()), GridItem(.flexible())],
            spacing: 16
        ) {
            BBNStatCard(label: "Usuarios", value: "\(metrics.totalUsers)")
            BBNStatCard(label: "Con plan", value: "\(metrics.paidUsers)")
            BBNStatCard(label: "Sesiones", value: "\(metrics.totalSessions)")
            BBNStatCard(
                label: "MRR",
                value: String(format: "€%.0f", Double(metrics.monthlyRevenueCents) / 100.0)
            )
        }
    }

    private func trendCards(_ metrics: PlatformMetrics) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())],
            spacing: 16
        ) {
            MetricTrendCard(
                title: "Nuevos usuarios / día",
                points: metrics.signupTrend,
                valueFormat: { "\(Int($0))" }
            )
            MetricTrendCard(
                title: "Ingresos / día (€)",
                points: metrics.revenueTrend,
                valueFormat: { String(format: "%.0f", $0 / 100.0) }
            )
        }
    }
}
```

- [ ] **Step 3: Wire + build + commit**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
ruby ../scripts/xcode/add_file_to_target.rb BoxBoxNowDashboard \
     "BoxBoxNowDashboard/Features/Admin/Platform/MetricTrendCard.swift"

xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           build 2>&1 | tail -5
```

Expected: `** BUILD SUCCEEDED **`.

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Features/Admin/Platform/ \
        BoxBoxNow/BoxBoxNowDashboard/Features/Admin/AdminPlatformView.swift \
        BoxBoxNow/BoxBoxNow.xcodeproj/
git commit -m "feat(ipad): admin platform metrics module"
```

**End of Phase D.** All 15 dashboard modules are feature-complete.

---

## Task 33: UI smoke tests

End-to-end tests that boot the dashboard target in the iPad simulator against a mocked URL session and verify navigation, admin gating, sidebar filtering, reconnect banners and logout flow.

**Files:**
- Create: `BoxBoxNow/BoxBoxNowDashboardUITests/BoxBoxNowDashboardUITests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardUITests/LoginFlowTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardUITests/SidebarNavigationTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardUITests/AdminGatingTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardUITests/ReconnectBannerTests.swift`
- Create: `BoxBoxNow/BoxBoxNowDashboardUITests/LogoutFlowTests.swift`
- Modify: `BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboardApp.swift` (honour `UITestMode` env var)

The tests rely on a launch-argument-driven stub mode so the app returns pre-canned REST responses and a canned WS stream instead of hitting the real backend.

- [ ] **Step 1: Add `UITestMode` to app entry**

Overwrite `BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboardApp.swift` with the UI-test-aware version:

```swift
import SwiftUI

@main
struct BoxBoxNowDashboardApp: App {
    @State private var app: AppStore

    init() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("--ui-test-mode") {
            _app = State(initialValue: AppStore.makeForUITests())
        } else {
            _app = State(initialValue: AppStore())
        }
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if case .loggedIn = app.auth.authState {
                    RootView()
                } else {
                    AuthFlowView()
                }
            }
            .environment(app)
            .task { await app.bootstrap() }
            .preferredColorScheme(.dark)
            .tint(BBNColors.accent)
        }
    }
}
```

- [ ] **Step 1.5: Create the test-only factory + stub services**

Create `BoxBoxNow/BoxBoxNowDashboard/TestSupport/AppStore+UITests.swift` (compiled only in `DEBUG`):

```swift
#if DEBUG
import Foundation

extension AppStore {
    /// Builds an `AppStore` with fully stubbed services so UI tests never
    /// touch the real backend. Launch arg parsing decides which flavour of
    /// stub user is injected.
    static func makeForUITests() -> AppStore {
        let args = ProcessInfo.processInfo.arguments
        let userFlavour = args.first(where: { $0.hasPrefix("--ui-test-user=") })?
            .replacingOccurrences(of: "--ui-test-user=", with: "") ?? "admin"
        let wsDropSeconds = args.first(where: { $0.hasPrefix("--ui-test-ws-drop=") })
            .flatMap { Int($0.replacingOccurrences(of: "--ui-test-ws-drop=", with: "")) }
        let wsTerminateSeconds = args.first(where: { $0.hasPrefix("--ui-test-ws-terminate=") })
            .flatMap { Int($0.replacingOccurrences(of: "--ui-test-ws-terminate=", with: "")) }

        let authService = StubAuthService(flavour: userFlavour)
        let keychain = MockKeychainHelper()
        let wsClient = StubRaceWebSocketClient(
            dropAfter: wsDropSeconds.map(TimeInterval.init),
            terminateAfter: wsTerminateSeconds.map(TimeInterval.init)
        )

        let store = AppStore(
            auth:      AuthStore(service: authService, keychain: keychain),
            race:      RaceStore(service: StubRaceService(), ws: wsClient),
            config:    ConfigStore(config: StubConfigService()),
            analytics: AnalyticsStore(service: StubAnalyticsService()),
            replay:    ReplayStore(service: StubReplayService()),
            insights:  InsightsStore(service: StubInsightsService()),
            admin:     AdminStore(service: StubAdminService())
        )
        // Preload state the UI tests can observe immediately.
        Task { @MainActor in
            await store.auth.loginWithStubUser(flavour: userFlavour)
            await store.race.applyStubSnapshot()
            await store.config.reloadSessions()
            await store.admin.reloadUsers()
        }
        return store
    }
}
#endif
```

Create `BoxBoxNow/BoxBoxNowDashboard/TestSupport/Stubs.swift` (compiled only in `DEBUG`) — one file with every stub in it:

```swift
#if DEBUG
import Foundation

struct StubAuthService: AuthServicing {
    let flavour: String
    func login(email: String, password: String) async throws -> AuthResponse {
        AuthResponse(
            accessToken: "stub-token",
            mfaRequired: flavour == "mfa-required",
            mfaSetupRequired: false,
            otpAuthURL: nil,
            user: stubUser(flavour: flavour)
        )
    }
    func verifyMFA(code: String, email: String) async throws -> AuthResponse {
        AuthResponse(accessToken: "stub-token", mfaRequired: false, mfaSetupRequired: false, otpAuthURL: nil, user: stubUser(flavour: flavour))
    }
    func me() async throws -> User { stubUser(flavour: flavour) }
    func exchangeGoogleCode(_ code: String) async throws -> AuthResponse {
        AuthResponse(accessToken: "stub-token", mfaRequired: false, mfaSetupRequired: false, otpAuthURL: nil, user: stubUser(flavour: flavour))
    }
}

func stubUser(flavour: String) -> User {
    let allTabs = SidebarItem.allCases.map(\.tabSlug)
    let regularTabs = SidebarItem.allCases.filter { !$0.requiresAdmin }.map(\.tabSlug)
    switch flavour {
    case "admin":
        return User(id: 1, username: "admin", email: "admin@bbn.test", isAdmin: true, mfaEnabled: false, mfaRequired: false, tabAccess: allTabs, hasActiveSubscription: true, subscriptionPlan: "pro", subscriptionStatus: "active")
    case "mfa-required":
        return User(id: 2, username: "mfa", email: "mfa@bbn.test", isAdmin: false, mfaEnabled: true, mfaRequired: true, tabAccess: regularTabs, hasActiveSubscription: true, subscriptionPlan: "pro", subscriptionStatus: "active")
    default:
        return User(id: 3, username: "user", email: "user@bbn.test", isAdmin: false, mfaEnabled: false, mfaRequired: false, tabAccess: regularTabs, hasActiveSubscription: true, subscriptionPlan: "basic", subscriptionStatus: "active")
    }
}

struct StubConfigService: ConfigServicing {
    func fetchSessions() async throws -> [RaceSession] {
        [RaceSession(id: 1, name: "Stub Session", circuitId: 1, startsAt: Date(), durationMinutes: 60, ourKartNumber: 7)]
    }
    func createSession(_ draft: SessionDraft) async throws -> RaceSession {
        RaceSession(id: 2, name: draft.name, circuitId: draft.circuitId, startsAt: draft.startsAt, durationMinutes: draft.durationMinutes, ourKartNumber: draft.ourKartNumber)
    }
    func updateSession(id: Int, draft: SessionDraft) async throws -> RaceSession {
        RaceSession(id: id, name: draft.name, circuitId: draft.circuitId, startsAt: draft.startsAt, durationMinutes: draft.durationMinutes, ourKartNumber: draft.ourKartNumber)
    }
    func deleteSession(id: Int) async throws {}
    func fetchTeams(sessionId: Int) async throws -> [Team] { [] }
    func createTeam(_ draft: TeamDraft) async throws -> Team { Team(id: 1, name: draft.name, sessionId: draft.sessionId, drivers: [], kartNumber: draft.kartNumber, tierScore: draft.tierScore) }
    func updateTeam(id: Int, draft: TeamDraft) async throws -> Team { Team(id: id, name: draft.name, sessionId: draft.sessionId, drivers: [], kartNumber: draft.kartNumber, tierScore: draft.tierScore) }
    func deleteTeam(id: Int) async throws {}
    func fetchCircuits() async throws -> [Circuit] { [Circuit(id: 1, name: "Stub Circuit", lengthM: 1200)] }
    func createCircuit(_ draft: CircuitDraft) async throws -> Circuit { Circuit(id: 2, name: draft.name, lengthM: draft.lengthM) }
    func updateCircuit(id: Int, draft: CircuitDraft) async throws -> Circuit { Circuit(id: id, name: draft.name, lengthM: draft.lengthM) }
    func deleteCircuit(id: Int) async throws {}
    func activateCircuit(id: Int) async throws -> Circuit { Circuit(id: id, name: "Active", lengthM: 1200) }
    func fetchPresets() async throws -> [DriverConfigPreset] { [] }
    func createPreset(_ preset: DriverConfigPreset) async throws -> DriverConfigPreset { preset }
    func updatePreset(id: Int, preset: DriverConfigPreset) async throws -> DriverConfigPreset { preset }
    func deletePreset(id: Int) async throws {}
    func fetchPreferences() async throws -> DriverPreferences { DriverPreferences(defaultPresetId: nil, showBoxAlerts: true, alertVolume: 0.8) }
    func updatePreferences(_ prefs: DriverPreferences) async throws -> DriverPreferences { prefs }
}

```

Add a stub struct for each remaining protocol (`RaceServicing`, `AnalyticsServicing`, `ReplayServicing`, `InsightsServicing`, `AdminServicing`) in the same `Stubs.swift` file. Each one conforms to its protocol and returns exactly **one** hard-coded element per method (one `KartAnalytics`, one `ReplaySnapshot`, one `GPSLap`, one `UserListItem`, one `AdminCircuit`, one `CircuitHubEntry`, one `PlatformMetrics` with three `MetricPoint`s). No method throws. The concrete values don't matter as long as every ScrollView has at least one row to render and every chart has at least three data points.

The `StubRaceWebSocketClient` implements `RaceWebSocketClientProtocol` from Task 9 and schedules its `.disconnected` → `.connected` transitions off a `Task.sleep` loop when `dropAfter` / `terminateAfter` are set.

`AuthStore.loginWithStubUser(flavour:)` and `RaceStore.applyStubSnapshot()` are small test-only helpers added in the same `#if DEBUG` extension files — they set the state directly without hitting services.

- [ ] **Step 2: Base class for UI tests**

Write `BoxBoxNow/BoxBoxNowDashboardUITests/BoxBoxNowDashboardUITests.swift`:

```swift
import XCTest

class DashboardUITestBase: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        app.launchArguments += ["--ui-test-mode"]
    }

    func launchAsAdmin() {
        app.launchArguments += ["--ui-test-user=admin"]
        app.launch()
    }

    func launchAsRegular() {
        app.launchArguments += ["--ui-test-user=regular"]
        app.launch()
    }
}
```

Parse these args in `AppStore.makeForUITests` to pick which stub user to inject.

- [ ] **Step 3: `LoginFlowTests`**

Write `BoxBoxNow/BoxBoxNowDashboardUITests/LoginFlowTests.swift`:

```swift
import XCTest

final class LoginFlowTests: DashboardUITestBase {

    func test_login_with_email_password_shows_sidebar() {
        app.launchArguments += ["--ui-test-user=regular", "--ui-test-start=logged-out"]
        app.launch()

        let emailField = app.textFields["login_email"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 2))
        emailField.tap()
        emailField.typeText("user@example.com")

        let passwordField = app.secureTextFields["login_password"]
        passwordField.tap()
        passwordField.typeText("secret")

        app.buttons["login_submit"].tap()

        let sidebar = app.otherElements["sidebar"]
        XCTAssertTrue(sidebar.waitForExistence(timeout: 5))
    }

    func test_mfa_flow_enters_code_screen() {
        app.launchArguments += ["--ui-test-user=mfa-required", "--ui-test-start=logged-out"]
        app.launch()

        app.textFields["login_email"].tap()
        app.textFields["login_email"].typeText("mfa@example.com")
        app.secureTextFields["login_password"].tap()
        app.secureTextFields["login_password"].typeText("secret")
        app.buttons["login_submit"].tap()

        let mfaField = app.textFields["mfa_code"]
        XCTAssertTrue(mfaField.waitForExistence(timeout: 3))
    }
}
```

Add matching `.accessibilityIdentifier(...)` modifiers in `LoginView`, `MFACodeView`, `SidebarView` (as an invisible `otherElements["sidebar"]`).

- [ ] **Step 4: `SidebarNavigationTests`**

Write `BoxBoxNow/BoxBoxNowDashboardUITests/SidebarNavigationTests.swift`:

```swift
import XCTest

final class SidebarNavigationTests: DashboardUITestBase {

    func test_tapping_each_sidebar_row_shows_its_module() {
        launchAsAdmin()
        let rows: [(String, String)] = [
            ("sidebar_race",          "race_screen"),
            ("sidebar_pit",           "pit_screen"),
            ("sidebar_live",          "live_screen"),
            ("sidebar_config",        "config_screen"),
            ("sidebar_adjusted",      "adjusted_screen"),
            ("sidebar_driver",        "driver_live_screen"),
            ("sidebar_replay",        "replay_screen"),
            ("sidebar_analytics",     "analytics_screen"),
            ("sidebar_insights",      "insights_screen"),
            ("sidebar_admin_users",   "admin_users_screen"),
            ("sidebar_admin_circuits","admin_circuits_screen"),
            ("sidebar_admin_hub",     "admin_hub_screen"),
            ("sidebar_admin_platform","admin_platform_screen"),
        ]

        for (rowId, screenId) in rows {
            let row = app.buttons[rowId]
            XCTAssertTrue(row.waitForExistence(timeout: 3), "row \(rowId) missing")
            row.tap()
            XCTAssertTrue(app.otherElements[screenId].waitForExistence(timeout: 3),
                          "screen \(screenId) missing for \(rowId)")
        }
    }
}
```

Tag every module view root with `.accessibilityIdentifier("race_screen")` etc. Tag every sidebar row with its `sidebar_<slug>` identifier.

- [ ] **Step 5: `AdminGatingTests`**

Write `BoxBoxNow/BoxBoxNowDashboardUITests/AdminGatingTests.swift`:

```swift
import XCTest

final class AdminGatingTests: DashboardUITestBase {

    func test_regular_user_does_not_see_admin_rows() {
        launchAsRegular()
        XCTAssertTrue(app.buttons["sidebar_race"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["sidebar_admin_users"].exists)
        XCTAssertFalse(app.buttons["sidebar_admin_platform"].exists)
    }

    func test_admin_user_sees_all_admin_rows() {
        launchAsAdmin()
        XCTAssertTrue(app.buttons["sidebar_admin_users"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["sidebar_admin_circuits"].exists)
        XCTAssertTrue(app.buttons["sidebar_admin_hub"].exists)
        XCTAssertTrue(app.buttons["sidebar_admin_platform"].exists)
    }
}
```

- [ ] **Step 6: `ReconnectBannerTests`**

Write `BoxBoxNow/BoxBoxNowDashboardUITests/ReconnectBannerTests.swift`:

```swift
import XCTest

final class ReconnectBannerTests: DashboardUITestBase {

    func test_ws_drop_shows_reconnect_banner_then_recovers() {
        app.launchArguments += ["--ui-test-user=admin", "--ui-test-ws-drop=5"]
        app.launch()

        app.buttons["sidebar_race"].tap()
        // The canned WS will close after 5 seconds; banner should appear.
        let banner = app.staticTexts["reconnect_banner"]
        XCTAssertTrue(banner.waitForExistence(timeout: 8))

        // And it should disappear once the canned client re-opens the socket.
        let disappeared = NSPredicate(format: "exists == false")
        expectation(for: disappeared, evaluatedWith: banner)
        waitForExpectations(timeout: 10)
    }
}
```

Add `StubRaceWebSocketClient` behind the `--ui-test-ws-drop=N` arg to programmatically close and reopen its stream.

- [ ] **Step 7: `LogoutFlowTests`**

Write `BoxBoxNow/BoxBoxNowDashboardUITests/LogoutFlowTests.swift`:

```swift
import XCTest

final class LogoutFlowTests: DashboardUITestBase {

    func test_logout_returns_to_login_screen() {
        launchAsAdmin()
        let accountMenu = app.buttons["account_menu"]
        XCTAssertTrue(accountMenu.waitForExistence(timeout: 3))
        accountMenu.tap()
        app.buttons["menu_logout"].tap()

        XCTAssertTrue(app.textFields["login_email"].waitForExistence(timeout: 3))
    }

    func test_ws_4001_terminated_forces_logout() {
        app.launchArguments += ["--ui-test-user=admin", "--ui-test-ws-terminate=2"]
        app.launch()
        XCTAssertTrue(app.textFields["login_email"].waitForExistence(timeout: 8))
    }
}
```

`--ui-test-ws-terminate=N` instructs the stub WS client to close with 4001 after N seconds.

- [ ] **Step 8: Add accessibility identifiers**

Go through every view edited in Phases A–D and add `.accessibilityIdentifier(...)` modifiers where the UI tests expect them (sidebar rows, module roots, login fields, account menu, reconnect banner). Example for `LoginView`:

```swift
TextField("Email", text: $email)
    .accessibilityIdentifier("login_email")
```

This is a mechanical pass — no semantics change.

- [ ] **Step 9: Create the UI test target**

Extend `scripts/xcode/create_dashboard_target.rb` (from Task 1) so it also generates `BoxBoxNowDashboardUITests` (a `ui_testing_bundle`). If the script was run once already without this step, add a follow-up script:

```ruby
# scripts/xcode/add_ui_test_target.rb
require 'xcodeproj'
project_path = ARGV[0] || 'BoxBoxNow/BoxBoxNow.xcodeproj'
project = Xcodeproj::Project.open(project_path)

app_target = project.targets.find { |t| t.name == 'BoxBoxNowDashboard' }
abort 'BoxBoxNowDashboard target missing' unless app_target

ui_test_target = project.new_target(
  :ui_testing_bundle,
  'BoxBoxNowDashboardUITests',
  :ios,
  '17.0',
  app_target
)
ui_test_target.build_configurations.each do |config|
  config.build_settings['TEST_TARGET_NAME'] = 'BoxBoxNowDashboard'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['SWIFT_VERSION'] = '5.9'
end
ui_test_dir = File.join(File.dirname(project_path), 'BoxBoxNowDashboardUITests')
FileUtils.mkdir_p(ui_test_dir)
project.save
puts "Created BoxBoxNowDashboardUITests target"
```

Run:

```bash
ruby scripts/xcode/add_ui_test_target.rb
for f in BoxBoxNowDashboardUITests SidebarNavigationTests LoginFlowTests \
         AdminGatingTests ReconnectBannerTests LogoutFlowTests; do
  ruby scripts/xcode/add_file_to_target.rb BoxBoxNowDashboardUITests \
       "BoxBoxNowDashboardUITests/${f}.swift"
done
```

- [ ] **Step 10: Run full UI test suite**

```bash
xcodebuild -project BoxBoxNow/BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test -only-testing:BoxBoxNowDashboardUITests 2>&1 | tail -20
```

Expected: `** TEST SUCCEEDED **`. Every stub-based test passes without touching the real backend.

- [ ] **Step 11: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboardUITests/ \
        BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboardApp.swift \
        BoxBoxNow/BoxBoxNowDashboard/TestSupport/ \
        BoxBoxNow/BoxBoxNow.xcodeproj/ \
        scripts/xcode/add_ui_test_target.rb
git commit -m "test(ipad): UI smoke tests for login/sidebar/admin/reconnect/logout"
```

---

### Task 34: TestFlight packaging & final integration run

**Files:**
- Modify: `BoxBoxNow/BoxBoxNowDashboard/Info.plist` (version + build)
- Modify: `BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboard.entitlements` (Keychain access group shared with driver)
- Create: `fastlane/BoxBoxNowDashboard/Fastfile` (optional; only if `fastlane/` exists in the repo)

- [ ] **Step 1: Bump version + build**

Edit `Info.plist`:

```xml
<key>CFBundleShortVersionString</key>
<string>1.0.0</string>
<key>CFBundleVersion</key>
<string>1</string>
<key>LSRequiresIPhoneOS</key>
<true/>
<key>UIRequiredDeviceCapabilities</key>
<array>
    <string>arm64</string>
</array>
<key>UIDeviceFamily</key>
<array>
    <integer>2</integer>
</array>
<key>UISupportedInterfaceOrientations~ipad</key>
<array>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationPortraitUpsideDown</string>
</array>
```

- [ ] **Step 2: Confirm shared Keychain Access Group**

Edit `BoxBoxNowDashboard.entitlements`:

```xml
<key>keychain-access-groups</key>
<array>
    <string>$(AppIdentifierPrefix)com.jizcue.BoxBoxNow.shared</string>
</array>
```

Make sure the existing driver app `BoxBoxNow.entitlements` contains the same group (it already does per the brainstorming spec).

- [ ] **Step 3: Archive build**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
xcodebuild -project BoxBoxNow.xcodeproj \
           -scheme BoxBoxNowDashboard \
           -sdk iphoneos \
           -configuration Release \
           -destination 'generic/platform=iOS' \
           clean archive \
           -archivePath build/BoxBoxNowDashboard.xcarchive 2>&1 | tail -20
```

Expected: `** ARCHIVE SUCCEEDED **`. If code-signing fails because the user has not yet registered the bundle id `com.boxboxnow.dashboard` on App Store Connect, stop here and prompt the user to do so.

- [ ] **Step 4: Export for TestFlight**

```bash
xcodebuild -exportArchive \
           -archivePath build/BoxBoxNowDashboard.xcarchive \
           -exportPath build/BoxBoxNowDashboard-ipa \
           -exportOptionsPlist ../scripts/xcode/ExportOptions.plist 2>&1 | tail -20
```

Create `scripts/xcode/ExportOptions.plist` if it does not exist:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTD/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>uploadSymbols</key>
    <true/>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
```

- [ ] **Step 5: Full regression run**

```bash
cd /Users/jizcue/boxboxnow-v2/BoxBoxNow
xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNowDashboard \
           -destination 'platform=iOS Simulator,name=iPad Pro (13-inch) (M4)' \
           test 2>&1 | tail -30
```

Expected: every unit + UI test in `BoxBoxNowDashboardTests` and `BoxBoxNowDashboardUITests` passes. No regressions in the driver targets — repeat for the driver scheme:

```bash
xcodebuild -project BoxBoxNow.xcodeproj -scheme BoxBoxNow \
           -destination 'platform=iOS Simulator,name=iPhone 15' \
           test 2>&1 | tail -10
```

Expected: driver tests still pass.

- [ ] **Step 6: Commit**

```bash
git add BoxBoxNow/BoxBoxNowDashboard/Info.plist \
        BoxBoxNow/BoxBoxNowDashboard/BoxBoxNowDashboard.entitlements \
        scripts/xcode/ExportOptions.plist
git commit -m "chore(ipad): TestFlight packaging (v1.0.0 build 1, shared keychain)"
```

- [ ] **Step 7: Final sanity check — concurrency with web session**

Manually verify the iPad consumes the same "web" device slot as the browser (spec says driver app consumes a separate mobile slot):
1. Log in on the iPad as user U.
2. Open a web browser tab on the same user U.
3. The iPad should be force-logged-out with close code 4003 (session terminated by another login).

Document the verification run in the commit message or as a follow-up issue; no code change expected here unless the behaviour differs from the spec.

---

**Plan complete.** Executing every task in order produces an iPad app that mirrors the web dashboard 1:1 (minus subscription management) and ships as a TestFlight build sharing a single Xcode project with the existing driver app.
