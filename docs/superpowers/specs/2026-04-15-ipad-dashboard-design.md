# iPad Native Dashboard App

**Date:** 2026-04-15
**Status:** Approved
**Target:** iPadOS 17+

## Problem

BoxBoxNow ships a web dashboard (Next.js) and two driver apps (native iOS + native Android) for the pit wall and the pilot respectively. The web dashboard is the primary monitoring and management surface but it runs in a browser — suboptimal for iPads mounted at the pit wall (no app icon, no keyboard locking, no offline-friendly chrome, dependent on a Safari tab staying open). We need a **native iPad application** that replicates the web dashboard's feature set 1:1, respects the existing backend's session model, and reuses low-level infrastructure from the existing native iOS driver app where possible.

## Constraints

1. **Replicate the web dashboard, not the landing page.** No marketing / pricing / register flows.
2. **Concurrency parity with the web.** The backend's `DeviceSession` model distinguishes `web` from `mobile` slots. The iPad **must consume a `web` slot** (`device=web` in the WebSocket query string), matching a browser tab — a user with a web session already open should have the same "max devices" limit apply across browsers + iPads.
3. **No account / subscription / billing module.** Users cannot change, upgrade, or cancel subscriptions from the iPad. No porting of `stripe_routes.py`, `SubscriptionTab.tsx`, pricing / payment screens, or profile edit. A read-only profile popover is acceptable.
4. **Visual & interaction parity with the web dashboard.** Same design tokens (colors, fonts, component hierarchy), same navigation taxonomy, same data coverage.

## Key Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Project structure | **New target inside existing `BoxBoxNow.xcodeproj`** (`BoxBoxNowDashboard`), sharing `Services/` and `Models/` via Target Membership | Minimizes scaffolding, reuses existing battle-tested `APIClient`, `KeychainHelper`, `BiometricService`, etc. Evolution to a Swift Package (`BoxBoxNowCore`) is noted for post-launch. |
| Scope | **Full parity with web dashboard**, including all 4 admin modules, delivered in 4 phases (A → B → C → D) | Acknowledges size upfront; phasing keeps each milestone shippable to TestFlight. |
| iOS minimum target | **iOS 17.0** | Unlocks `@Observable` macro and fine-grained SwiftUI re-renders — critical for 15 modules with large tables. Coverage is >95% of active iPads as of 2026. |
| Authentication methods | **Email+password + MFA (TOTP) + Google OAuth via `ASWebAuthenticationSession` + Face ID quick-login**. **No Sign in with Apple.** | Matches the existing iOS driver app, which has been accepted by App Store review under the enterprise exception of guideline 4.8. If Apple rejects the dashboard for the same reason, reintroduce Apple SSO following the driver app's pattern. |
| UI layout | **`NavigationSplitView`** (sidebar + detail) | Canonical iPadOS pattern, matches the web's Sidebar + Main area exactly. |
| Live tab | **`WKWebView`** embedded via `UIViewRepresentable` | The Live tab on the web is an iframe of Apex Timing — no native alternative exists. |
| Data visualization | **Swift Charts** (native, iOS 16+) + **custom `Canvas`** views for high-density GPS insights | Swift Charts covers Analytics tables/line/bar charts; `Canvas` handles the 3 GPS Insights views (trajectory map, speed trace, G-force scatter) which need +10k points without frame drops. |
| Architecture pattern | **MVVM with `@Observable` macro + `actor` for WebSocket** | iOS 17 `@Observable` eliminates `@Published` boilerplate and gives quirurgical re-renders. WebSocket as an actor prevents the race conditions we hit in the Android driver (double reconnects, zombie sessions). |
| Push notifications | **No** | Pit wall iPads live in foreground during races. Matches the web. |
| Multi-window support | **No (v1)** | Replicates web 1:1 (one pane). Future work. |
| Keychain sharing with driver app | **Yes** | Cross-app SSO via shared Keychain Access Group. Driver and dashboard consume different concurrency slots (`mobile` vs `web`) so there is no conflict. |
| Orientation | **Locked landscape** | iPad mounted on pit wall; portrait is not a real use case. |
| Device family | **iPad only** (`TARGETED_DEVICE_FAMILY = 2`) | Dashboard has no iPhone use case. |

## Architecture

### Target layout inside `BoxBoxNow.xcodeproj`

```
BoxBoxNow.xcodeproj
├── BoxBoxNow                         (existing — driver app, iPhone + iPad)
│   └── Bundle: com.jizcue.BoxBoxNow
└── BoxBoxNowDashboard                (NEW — dashboard iPad-only)
    ├── Bundle: com.jizcue.BoxBoxNowDashboard
    ├── TARGETED_DEVICE_FAMILY = 2    (iPad only)
    ├── iOS Deployment Target = 17.0
    └── Keychain Access Group: $(AppIdentifierPrefix)com.jizcue.BoxBoxNow.shared
```

Both targets are independent apps in the same workspace. They do NOT share SwiftUI Views, `@main` entry, assets, or storyboards — only the low-level Services + Models layer.

### Shared code via Target Membership

These existing files are marked as members of **both** targets (checkbox in Xcode's File Inspector):

```
BoxBoxNow/
├── Services/
│   ├── APIClient.swift            ← shared; dashboard adds behaviour via Swift extensions (non-breaking)
│   ├── WebSocketClient.swift      ← shared, UNCHANGED; driver app keeps using it as-is
│   ├── KeychainHelper.swift       ← shared, uses access group
│   └── BiometricService.swift     ← shared (Face ID / Touch ID)
├── Models/
│   ├── User.swift                 ← shared
│   ├── KartState.swift            ← shared, extended with new fields
│   ├── RaceConfig.swift           ← shared, extended with new fields
│   ├── Team.swift                 ← shared
│   └── GPSSample.swift            ← shared
└── Utilities/
    ├── Constants.swift            ← shared
    └── Formatters.swift           ← shared
```

### New target folder layout

```
BoxBoxNowDashboard/
├── App/
│   ├── BoxBoxNowDashboardApp.swift          (@main)
│   ├── AppDelegate.swift                    (URL schemes for OAuth callback)
│   └── Info.plist
├── Design/
│   ├── BBNColors.swift                      (tokens from tailwind.config.js)
│   ├── BBNTypography.swift                  (Outfit + JetBrains Mono)
│   ├── BBNTheme.swift                       (EnvironmentKey + helpers)
│   └── Components/
│       ├── BBNButton.swift
│       ├── BBNCard.swift
│       ├── BBNTable.swift
│       ├── BBNTierBadge.swift
│       ├── BBNStatusDot.swift
│       ├── BBNSection.swift
│       ├── BBNNumericField.swift
│       ├── BBNEmptyState.swift
│       ├── BBNLoadingOverlay.swift
│       └── BBNToast.swift
├── Models/                                   (new, dashboard-only)
│   ├── PitRecord.swift
│   ├── FifoEntry.swift
│   ├── FifoState.swift
│   ├── FifoSnapshot.swift
│   ├── ClassificationEntry.swift
│   ├── RaceSnapshot.swift
│   ├── WsMessage.swift
│   ├── WsUpdateEvent.swift
│   ├── ReplayStatus.swift
│   ├── Circuit.swift
│   ├── DeviceSession.swift
│   ├── DriverPreset.swift
│   ├── UserListItem.swift
│   ├── PlatformMetrics.swift
│   └── JSONValue.swift                     (helper for unknown-shape events)
├── Services/                                 (new, dashboard-only)
│   ├── RaceService.swift                    (/api/race)
│   ├── ConfigService.swift                  (/api/config)
│   ├── ReplayService.swift                  (/api/replay)
│   ├── AnalyticsService.swift               (/api/analytics)
│   ├── InsightsService.swift                (/api/insights)
│   ├── ApexReplayService.swift              (/api/apex-replay)
│   ├── AdminService.swift                   (/api/admin)
│   └── PublicService.swift                  (/api/public)
├── Stores/
│   ├── AppStore.swift                       (root, owns the others)
│   ├── AuthStore.swift
│   ├── RaceStore.swift
│   ├── ConfigStore.swift
│   └── AdminStore.swift
├── Features/
│   ├── Auth/
│   ├── Race/
│   ├── Pit/
│   ├── Live/
│   ├── Classification/
│   ├── Driver/
│   ├── Config/
│   ├── Replay/
│   ├── Analytics/
│   ├── Insights/
│   └── Admin/
└── Navigation/
    ├── RootView.swift                       (NavigationSplitView)
    ├── SidebarView.swift
    ├── DetailRouter.swift
    └── StatusBarView.swift
```

### Future evolution (post-launch, tracked in memory)

Once the app is stable (post-phase D), extract `Services/` + `Models/` into a local Swift Package `BoxBoxBowCore` inside the workspace. This gives: isolated build, isolated tests, easier addition of a 3rd target (widget, watchOS) in the future. Documented in `MEMORY.md → ios_native_app.md`.

## Data Layer

### Models (Swift counterparts of `frontend/src/types/race.ts`)

Every TypeScript `interface` becomes a `struct: Codable, Identifiable, Hashable` in Swift with PascalCase naming and camelCase fields. `CodingKeys` handles any snake_case discrepancies.

| TypeScript (web) | Swift (iPad) | Location |
|---|---|---|
| `KartState` | `KartState` — exists in driver app, **extend** with: `pitHistory`, `driverTotalMs`, `driverAvgLapMs`, `tierScore`, `avgLapMs`, `bestAvgMs`, `bestStintLapMs`, `driverDifferentialMs`, `recentLaps` | shared |
| `PitRecord` | `PitRecord` (use `pitNumber` as id) | new |
| `FifoEntry` | `FifoEntry` | new |
| `FifoState` | `FifoState` (contains `queue`, `score`, `history`) | new |
| `FifoSnapshot` | `FifoSnapshot` | new |
| `ClassificationEntry` | `ClassificationEntry` | new |
| `RaceConfig` | `RaceConfig` — exists in driver, **extend** with: `boxLines`, `boxKarts`, `minDriverTimeMin`, `pitClosedStartMin`, `pitClosedEndMin`, `rain`, `finishLat1/2`, `finishLon1/2` | shared, extend |
| `RaceSnapshot` | `RaceSnapshot` | new |
| `WsMessage` / `WsUpdateEvent` | `WsMessage` + `enum WsMessageType` + `WsUpdateEvent` with `extra: [String: JSONValue]` | new |
| `ReplayStatus` | `ReplayStatus` | new |
| (not in TS) | `Circuit` (for admin-circuits) | new |
| (not in TS) | `Team` — exists in driver | shared |
| (not in TS) | `DeviceSession` (for Config → Sessions UI) | new |
| (not in TS) | `DriverPreset` (for driver-config) | new |
| (not in TS) | `UserListItem` (for admin-users) | new |
| (not in TS) | `PlatformMetrics` (for admin-platform) | new |

**`JSONValue`**: an enum helper (`.string`, `.int`, `.double`, `.bool`, `.null`, `.array([JSONValue])`, `.object([String: JSONValue])`) for decoding `events[].extra` payloads from the WebSocket whose shape varies per subtype. This avoids dropping fields when the backend adds new event properties.

### Services (one per backend routes file)

| Backend file | Swift service | Representative endpoints |
|---|---|---|
| `auth_routes.py` | `AuthService` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/refresh`, `POST /api/auth/mfa/verify`, `POST /api/auth/mfa/setup`, `GET /api/auth/google/ios`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` |
| `race_routes.py` | `RaceService` (+ `RaceWebSocketClient` in the Store layer) | `GET /api/race/snapshot`, `GET /api/race/config`, `PATCH /api/race/config`, `POST /api/race/reset`, `GET /api/race/teams`, `PATCH /api/race/teams/:id`, WS `wss://.../ws/race?token=&view=&device=web` |
| `config_routes.py` | `ConfigService` | `GET /api/config/live-timing-url`, `GET /api/config/presets`, `POST /api/config/presets`, `DELETE /api/config/presets/:id`, `GET /api/config/preferences`, `PATCH /api/config/preferences` |
| `replay_routes.py` | `ReplayService` | `GET /api/replay/status`, `POST /api/replay/start`, `POST /api/replay/stop`, `POST /api/replay/pause`, `POST /api/replay/seek`, `POST /api/replay/speed`, `GET /api/replay/files` |
| `analytics_routes.py` | `AnalyticsService` | `GET /api/analytics/karts`, `GET /api/analytics/karts/:id/laps`, `GET /api/analytics/karts/:id/stints` |
| `gps_routes.py` | `InsightsService` | `GET /api/insights/trajectory`, `GET /api/insights/speed-trace`, `GET /api/insights/g-forces` |
| `apex_replay_routes.py` | `ApexReplayService` | `GET /api/apex-replay/sessions`, `POST /api/apex-replay/load` |
| `public_routes.py` | `PublicService` | `GET /api/public/status`, `GET /api/public/version` |
| `admin_routes.py` | `AdminService` | `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `DELETE /api/admin/users/:id`, `GET /api/admin/circuits`, `POST /api/admin/circuits`, `PATCH /api/admin/circuits/:id`, `GET /api/admin/hub`, `GET /api/admin/platform/metrics` |
| `stripe_routes.py` | **NOT PORTED** | Out of scope (subscription / billing module) |

### `APIClient` protocol (extended from existing driver app `APIClient.swift`)

```swift
protocol APIClientProtocol {
    func get<T: Decodable>(_ path: String, query: [URLQueryItem]?) async throws -> T
    func post<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T
    func patch<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T
    func delete(_ path: String) async throws
}
```

Added to the existing `APIClient` via **Swift `extension` blocks** (purely additive, no modification of existing methods, no breakage for the driver app):

1. **Automatic auth header** — reads `AuthStore.token` from shared Keychain
2. **401 handling** — emits `NotificationCenter.post(.authExpired)`; `AuthStore` listens and triggers logout
3. **JSON decoder** with `.convertFromSnakeCase` + ISO8601 dates
4. **Base URL** from `Constants.apiBaseURL`

If any of these overlap with existing behaviour in the driver app's `APIClient`, the existing behaviour wins (additions become no-ops). Each `Service` is a small `struct` that receives `APIClientProtocol` by constructor injection — trivially testable with an `APIClientMock`.

### Explicitly NOT ported (account / subscription module)

- Stripe integration entirely (`stripe_routes.py`)
- Subscription management screens (pricing, upgrade, downgrade, cancel)
- Payment methods (add/remove card, billing history)
- Profile edit (email, password change)

The profile popover in the `StatusBar` is **read-only**. User fields related to subscription (`subscription_tier`, `subscription_status`, `trial_ends_at`) are still decoded from `/api/auth/me` (the response shape is shared with the web) but only used to determine if the app can function (e.g., expired trial → redirect to the web to manage).

## State Management & Data Flow

### Four `@Observable` stores at app level

```swift
@Observable
final class AppStore {
    let auth: AuthStore
    let race: RaceStore
    let config: ConfigStore
    let admin: AdminStore   // nil if user is not admin
}
```

| Store | Responsibility | Contained state |
|---|---|---|
| `AuthStore` | login, logout, MFA, Google OAuth, refresh, 401 watch | `user`, `token`, `mfaRequired`, `sessions`, `authState` |
| `RaceStore` | single source of truth for race data; replaces the web's Zustand `useRaceStore` | `snapshot`, `karts`, `fifo`, `classification`, `replayStatus`, `isConnected`, `boxCallActive`, `raceStarted/Finished`, `trackName`, `countdownMs`, `config` |
| `ConfigStore` | circuits, presets, preferences, live-timing URL | `circuits`, `selectedCircuit`, `presets`, `preferences`, `liveTimingURL` |
| `AdminStore` | (admin only) users, circuits, hub, platform metrics | `users`, `platformMetrics` |

### `RaceWebSocketClient` as a Swift `actor`

This is the architectural cornerstone. **`RaceWebSocketClient` is a NEW file in the dashboard target only** (`BoxBoxNowDashboard/Services/RaceWebSocketClient.swift`) — **not** a refactor of the existing shared `WebSocketClient.swift`, which stays untouched to avoid risking the driver app. The two clients live side-by-side until a future consolidation (tracked in Future Evolution).

```swift
actor RaceWebSocketClient {
    private var task: URLSessionWebSocketTask?
    private var shouldReconnect = false
    private var reconnectDelayMs: Int = 1_000
    private let maxReconnectDelayMs = 30_000
    private var pingTask: Task<Void, Never>?
    private var readTask: Task<Void, Never>?

    let messages: AsyncStream<WsMessage>
    let connectionState: AsyncStream<ConnectionState>

    enum ConnectionState { case connecting, connected, disconnected(reason: CloseReason) }
    enum CloseReason { case normal, sessionTerminated, maxDevices, networkError(Error?) }

    func connect(url: URL, token: String) async
    func disconnect() async
    func send(_ text: String) async throws
}
```

**Why `actor` and not `class`:**
- The compiler **guarantees** there can be no two overlapping reconnect operations (the bug we had in the Android driver with the racy watchdog).
- `readTask` + `pingTask` + reconnect loop are orchestrated with structured `Task`s; if the connection drops, `task.cancel()` cascades without leaks.
- `RaceStore` lives on `@MainActor` and consumes messages via `AsyncStream` → zero-cost thread hopping, and `@Observable` properties are always written from the main thread.

**Keepalive**: `URLSessionWebSocketTask.sendPing` is called every 15 seconds inside `pingTask`. This is the exact equivalent of the `pingIntervalMillis = 15_000` fix applied to the Android driver.

**Reconnect**: exponential backoff 1s → 30s, identical to the web. On successful reconnect, emit `connected` — the store listens and re-requests a snapshot.

### Boot sequence

1. `AppStore.init` creates the stores but does **not** connect the WS.
2. `AuthStore.login()` obtains a token → calls `RaceStore.connect(token:)`.
3. `RaceStore.connect` starts `RaceWebSocketClient.connect(url:token:)`.
4. `RaceStore` starts `Task { for await msg in client.messages { apply(msg) } }` and `Task { for await state in client.connectionState { handle(state) } }`.
5. The first `snapshot` populates `karts`, `fifo`, `classification`, `config` in one shot.
6. Subsequent `update` events apply diffs by `rowId` / `kartNumber` on the existing array.

### Message handling (all 7 types from the web's `WsMessage`)

| Type | `RaceStore` handler | UI effect |
|---|---|---|
| `snapshot` | `applySnapshot(_:)` replaces all race state | All views re-render |
| `update` | `applyUpdates(_:)` iterates `events[]`, finds kart by `rowId`, mutates only that | Quirurgical re-render (1 row of RaceTable) |
| `fifo_update` | `applyFifoUpdate(_:)` replaces `fifo` | FifoQueue re-renders |
| `analytics` | `applyAnalytics(_:)` merges with snapshot (tier scores, avg laps) | Analytics tab + RaceTable tier colors |
| `replay_status` | `setReplayStatus(_:)` updates `replayStatus` | ReplayTab timeline scrubber |
| `teams_updated` | `reloadTeams()` triggers a `RaceService.getTeams()` | Config tab → team list |
| `box_call` | `boxCallActive = true`, auto-cleared after 10s | Full-screen red BoxCallOverlay |

### Error handling & edge cases

| Case | Detection | Action |
|---|---|---|
| WS close 4001 (session terminated) | `CloseReason.sessionTerminated` from the actor | `AuthStore.logout()` + navigate to LoginView with toast "Your session was closed from another device" |
| WS close 4003 (max devices) | `CloseReason.maxDevices` | LoginView with banner "Maximum concurrent devices reached" + link to Sessions |
| WS network error / idle timeout | `CloseReason.networkError` | Red top banner "Reconnecting..." + exponential backoff retry; stores keep last-known state (driver app parity) |
| REST 401 from any Service | `APIClient` detects → `NotificationCenter.post(.authExpired)` | `AuthStore` → logout → LoginView |
| App goes background | `@Environment(\.scenePhase) == .background` | Keep WS connected (pit-wall iPad rarely backgrounds long); if `.inactive` > 5 min, close WS cleanly and reconnect on `.active` |
| Token near expiry (<10 min) | `AuthStore` observes `Date.now` vs token's `expiresAt` | Transparently call `POST /api/auth/refresh`; on failure, logout |
| Change of active circuit | User picks another circuit in Config | `RaceStore.disconnect() → connect()` with the new query; equivalent to Zustand's `wsReconnectTrigger` |

### View-side state consumption

```swift
struct RaceTableView: View {
    @Environment(RaceStore.self) private var race

    var body: some View {
        Table(race.karts) { ... }
        // With @Observable, this view only invalidates when `race.karts` changes —
        // not when `race.fifo` or `race.classification` change.
    }
}
```

This granularity is the key advantage over `ObservableObject + @Published`, where any mutation would dirty all views observing the store.

## Navigation & Module Breakdown

### Root structure

```swift
struct RootView: View {
    @Environment(AppStore.self) private var app
    @State private var selection: SidebarItem? = .race
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        if app.auth.authState == .loggedIn {
            NavigationSplitView(columnVisibility: $columnVisibility) {
                SidebarView(selection: $selection)
                    .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 320)
            } detail: {
                NavigationStack { DetailRouter(selection: selection) }
            }
            .navigationSplitViewStyle(.balanced)
            .overlay(alignment: .top) { StatusBarView() }
            .overlay { if app.race.boxCallActive { BoxCallOverlay() } }
        } else {
            AuthFlowView()
        }
    }
}
```

### Sidebar: `enum SidebarItem`

```swift
enum SidebarItem: Hashable, Identifiable {
    case race, pit, live, config
    case adjusted, adjustedBeta
    case driver, driverConfig
    case replay, analytics, insights
    case adminUsers, adminCircuits, adminHub, adminPlatform
}
```

`SidebarView` uses `List(selection:)` + `Section` + `DisclosureGroup` for the 4 collapsible groups (Clasificación, Driver, Analysis, Admin). `DisclosureGroup` expand state is persisted in `@AppStorage`, mirroring the web's `_adminExpanded`, `_analysisExpanded`, etc.

**Permission filtering**: each item only appears if the user has the corresponding `tabAccess` permission, and a collapsible section only appears if at least one of its sub-items is visible. Replicates `visibleMainTabs`, `hasClasificacion`, `hasAdmin`, etc. from `Sidebar.tsx`. The Admin section additionally requires `user.isAdmin == true`.

### The 15 modules

| # | Module | Web reference | iPad view | Complexity | Notes |
|---|---|---|---|---|---|
| 1 | Race | `RaceTable.tsx` | `RaceTableView` | High | 20+ columns, tier color coding, row tap → `KartDetailSheet`, flash animation on position change |
| 2 | Pit | `FifoQueue.tsx`, `PitSummary.tsx` | `PitView` with internal TabView | Medium | 2 tabs: Cola FIFO (priority queue) + Historial |
| 3 | Live | `LiveIframe.tsx` | `LiveView(url:)` | Low | `UIViewRepresentable(WKWebView)` loading `liveTimingURL` from `ConfigStore` |
| 4 | Config | `ConfigTab.tsx` + children | `ConfigView` with Form + Sections | High | 5 sections: Sessions (device sessions), Teams (editable), Circuits (selector), Presets, Preferences |
| 5 | Adjusted | `AdjustedClassification.tsx` | `AdjustedClassificationView` | Medium | Sortable Table |
| 6 | Adjusted Beta | `AdjustedBetaClassification.tsx` | `AdjustedBetaClassificationView` | Medium | Same as above with BETA label |
| 7 | Driver | `DriverView.tsx` | `DriverLiveView` | **Very high** | 21 cards, responsive grid (2/3 cols), BOX call overlay, lap timer. **Reuse code** from `BoxBoxNow/Views/Driver/DriverView.swift` of the driver app. No local GPS/IMU — all values via WS |
| 8 | Driver Config | `DriverConfigTab.tsx` | `DriverConfigView` | High | Drag-to-reorder editor of the 21 cards, save per preset |
| 9 | Replay | `ReplayTab.tsx`, `ReplayTimeline.tsx` | `ReplayView` | **Very high** | Custom slider with event markers, play/pause/speed (0.5x→8x), file selector, `Canvas`-based lap-colored timeline |
| 10 | Analytics | `KartAnalyticsTab.tsx`, `KartDetailModal.tsx` | `KartAnalyticsView` + `KartDetailSheet` | High | Kart stats table + Swift Charts (line + bar) in detail sheet |
| 11 | Insights | `GpsInsightsTab.tsx` + 3 canvas children | `GpsInsightsView` with 3 sub-tabs | **Very high** | 3 `Canvas` views: trajectory map colored by speed, speed trace per lap, lateral-vs-longitudinal G-force scatter. +10k data points |
| 12 | Admin Users | `AdminPanel.tsx` (Users tab) | `AdminUsersView` | High | User list + inline `tabAccess` editing + toggle `isAdmin` + reset password + delete + per-user sessions |
| 13 | Admin Circuits | `AdminCircuitsTab.tsx` | `AdminCircuitsView` | Medium | CRUD: name, length, finish-line coords, active flag |
| 14 | Admin Hub | `AdminHubTab.tsx` | `AdminHubView` | Medium | Multi-tenant circuit management |
| 15 | Admin Platform | `AdminPlatformTab.tsx` | `AdminPlatformView` | Medium | Platform metrics (active users, sessions, backend usage) rendered with Swift Charts |

### StatusBar (top chrome)

Replica of `StatusBar.tsx`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ BBN │ Circuit: Jarama ▾ │ Session 1 ▾ │ ● Connected │ user@email.com ▾ │
└─────────────────────────────────────────────────────────────────────────┘
```

- BBN logo (N in accent green)
- Circuit selector (`Menu`) — changes the active circuit on the backend
- Session selector — picker for the active race session
- Connection indicator — green dot if `race.isConnected`, red pulsing if not
- User menu (`Menu`) — read-only profile, logout, device sessions management, language toggle es/en

Renders as an `overlay` at the top of the detail column, 48pt tall.

### Orientation and sizing

- **Locked landscape**. `Info.plist` → `UISupportedInterfaceOrientations~ipad` only `landscape-left` and `landscape-right`.
- **iPad only** (`TARGETED_DEVICE_FAMILY = 2`).
- **Minimum breakpoint**: iPad mini landscape (1133 × 744). With a 280pt sidebar, 853pt remain for the detail column. `RaceTable` must collapse non-critical columns at that width using `.adaptive` horizontal visibility on `TableColumn`.

## Authentication & Session Management

### `AuthStore` state machine

```
loggedOut ──login()──▶ authenticating ──200─▶ (mfa_enabled?) ──▶ needsMFACode ──verify()──▶ loggedIn
                │                                      │
                │ 401/403                              │ mfa_required && !mfa_enabled
                ▼                                      ▼
          loginFailed(msg)                      needsMFASetup
                │
                └─retry─▶ authenticating                 (loggedIn state is exited by logout, 4001, 4003, or 401)
```

Each transition fires a side effect (navigation, toast, etc.) observed by `AuthFlowView`.

### Email + password + MFA flow

1. `LoginView`: two `TextField`s (email + password) + "Entrar" button. On tap, `authState = .authenticating`.
2. `AuthService.login(email:password:)` → `POST /api/auth/login` → `LoginResponse { access_token, user, mfa_required, mfa_enabled, mfa_secret? }`.
3. **Branch A** (`user.mfa_enabled == false && user.mfa_required == false`): save token, `authState = .loggedIn`.
4. **Branch B** (`user.mfa_enabled == true`): `authState = .needsMFACode`. Navigate to `MFACodeView` with a 6-digit `TextField` (`.keyboardType(.numberPad)`). On submit: `POST /api/auth/mfa/verify { mfa_code }`. If OK → `.loggedIn`.
5. **Branch C** (`user.mfa_required == true && user.mfa_enabled == false`): `authState = .needsMFASetup`. Navigate to `MFASetupView` with QR (otpauth:// URL as image) + confirmation code input. Cannot be skipped.

Token is persisted via `KeychainHelper.save(service:account:data:)` in the shared Keychain Access Group.

### Google OAuth via `ASWebAuthenticationSession`

The backend already has an iOS-specific endpoint: `GET /api/auth/google/ios` (see `auth_routes.py:737`), whose `redirect_uri` points to `/api/auth/google/callback/ios`.

```swift
import AuthenticationServices

final class GoogleOAuthFlow: NSObject, ASWebAuthenticationPresentationContextProviding {
    func start() async throws -> String {    // returns JWT
        let authURL = URL(string: "\(Constants.apiBaseURL)/api/auth/google/ios")!
        let callbackScheme = "boxboxnow"

        return try await withCheckedThrowingContinuation { cont in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                guard let url = callbackURL,
                      let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "token" })?.value
                else { cont.resume(throwing: OAuthError.noToken); return }
                cont.resume(returning: token)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            session.start()
        }
    }
}
```

**Small backend change required**: `auth_routes.py::google_callback_ios` currently redirects to the frontend URL. It must redirect to `boxboxnow://auth/google?token={jwt}` instead. This is a ~5-line change, blocking for Phase A.

**`Info.plist` registration** in `BoxBoxNowDashboard`:

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>boxboxnow</string>
        </array>
    </dict>
</array>
```

### Biometric quick-login (Face ID / Touch ID)

Reuse the existing `BiometricService` from the driver app (shared Target Membership). On launch:

1. If `KeychainHelper.loadToken() != nil && BiometricService.isEnabled`, show a "Verifying identity..." screen with the biometric icon.
2. Call `BiometricService.authenticate(reason:)` using `LAPolicy.deviceOwnerAuthenticationWithBiometrics`.
3. On success → `authState = .loggedIn` directly, skipping the email form.
4. On cancel → fallback to the email+password form.

iPad Pro uses Face ID; iPad mini / Air 11" uses Touch ID in the power button. The same service covers both.

### Sign in with Apple: explicitly NOT implemented

Rationale: the existing iOS driver app (`BoxBoxNow/Views/Login/LoginView.swift`) ships email+password + MFA + Google OAuth without Sign in with Apple, and App Store review has accepted it under guideline 4.8's enterprise exception. The dashboard shares the same backend and account model and is expected to be accepted on the same grounds. If Apple review rejects the dashboard specifically, reintroduce the flow following the driver app's pattern: add `POST /api/auth/apple` endpoint verifying `identityToken` against Apple's JWKs, plus `SignInWithAppleButton` in `LoginView`.

### Device session management (Config → Sessions)

The backend already exposes `GET /api/auth/sessions` and `DELETE /api/auth/sessions/:id`. The iPad's Config module includes a "Sessions" section showing all `DeviceSession`s for the current user:

```
┌──────────────────────────────────────────────────────────────┐
│ Active Sessions                                              │
├──────────────────────────────────────────────────────────────┤
│ 🖥  Chrome 131 · Mac · Madrid, ES · Active now       [✖]    │
│ 📱  BoxBoxNow iOS · iPhone 15 · Madrid, ES · 2h ago  [✖]    │
│ 🖥  BoxBoxNow iPad Dashboard · iPad Pro · now (YOU)  [─]    │
└──────────────────────────────────────────────────────────────┘
```

- Current session cannot be closed from here (use logout instead).
- Closing another session causes the backend to send WS close `4001` to that device, which detects it and navigates to login with a toast.

### Cross-app SSO with driver app via shared Keychain

Both targets (`BoxBoxNow` driver and `BoxBoxNowDashboard`) share a Keychain Access Group. `KeychainHelper` uses `kSecAttrAccessGroup = "$(AppIdentifierPrefix)com.jizcue.BoxBoxNow.shared"`.

**Flow**: user logs in via driver app → token saved to group → opens dashboard → `AuthStore.bootstrap()` reads the token → calls `GET /api/auth/me` → if 200, `authState = .loggedIn` directly.

**Slot compatibility**: driver uses `device=mobile`, dashboard uses `device=web`. Different concurrency pools, no conflict.

**Logout behaviour**: logout from either app clears the token from the shared group, so the other app will need to re-authenticate next launch — this is intentional and matches the user's mental model of a "global" logout.

### App Transport Security

- `NSAppTransportSecurity.NSAllowsArbitraryLoads = false` (production is HTTPS-only).
- In debug, `NSExceptionDomains` permits `localhost` for local backend at `http://localhost:8000`.
- URL scheme callback validation: accept only `boxboxnow://auth/google` (strict host+path match) to prevent scheme hijacking by another app.

## Design System

### Color tokens (mapped from `tailwind.config.js`)

```swift
extension Color {
    static let bbnBackground   = Color(hex: 0x000000)  // bg
    static let bbnSurface      = Color(hex: 0x111111)  // surface
    static let bbnCard         = Color(hex: 0x0a0a0a)  // card
    static let bbnBorder       = Color(hex: 0x1a1a1a)  // border
    static let bbnAccent       = Color(hex: 0x9fe556)  // accent (BBN green)
    static let bbnAccentHover  = Color(hex: 0xb8f070)
    static let bbnAccentDim    = Color(hex: 0x9fe556).opacity(0.15)
    static let bbnMuted        = Color(hex: 0xe5e5e5)

    // Tier colors (leaderboard)
    static let bbnTier100 = Color(hex: 0x9fe556)
    static let bbnTier75  = Color(hex: 0xc8e946)
    static let bbnTier50  = Color(hex: 0xe5d43a)
    static let bbnTier25  = Color(hex: 0xe59a2e)
    static let bbnTier1   = Color(hex: 0xe54444)
}
```

### Typography

- **Outfit** (sans-serif) — UI chrome, buttons, labels. OFL-licensed, redistributable.
- **JetBrains Mono** — all numeric displays (lap times, positions, kart numbers). Required for tabular alignment.
- Both fonts are bundled in `Assets/Fonts/` as `.ttf`, registered in `Info.plist → UIAppFonts`, exposed as `Font.bbnBody`, `Font.bbnMono`, `Font.bbnMonoLarge` via extensions.

### Reusable components (`Design/Components/`)

| Component | Web equivalent | Description |
|---|---|---|
| `BBNCard` | `.bg-card + .border-border + .rounded-lg` | 12pt padding, 12pt corners, `bbnCard` bg, 1pt `bbnBorder` |
| `BBNPrimaryButton` | `.bg-accent` button | 44pt tall, accent bg, black text, disabled state |
| `BBNSecondaryButton` | `.bg-surface` button | Outlined variant |
| `BBNTable` | `RaceTable.tsx` base | Wraps SwiftUI `Table` with BBN defaults (sticky header, 36pt row height, zebra `bbnSurface`) |
| `BBNTierBadge` | `<span className="text-tier-N">` | Small indicator colored by tier score |
| `BBNStatusDot` | `● Connected` | Animated (pulse) green/red dot |
| `BBNSection` | `<section className="border-b border-border">` | Section with title + bottom divider |
| `BBNNumericField` | input numeric | `TextField` with `.decimalPad` + ES locale |
| `BBNEmptyState` | "No data" component | Icon + title + subtitle + optional action |
| `BBNLoadingOverlay` | global spinner | Semi-transparent overlay + `ProgressView` |
| `BBNToast` | toast notifications | Temporary top notification (3s auto-dismiss) |

### Animations (parity with the web)

- **Row position change** in `RaceTable`: flash green/red for 300ms on position movements (web uses `framer-motion`).
- **BOX call overlay**: full-screen red with `boxFlash` animation (0.5s ease-in-out, infinite, `autoreverses`).
- **Connection dot**: infinite pulse when disconnected, static when connected.
- **Sidebar collapse**: 200ms horizontal slide (native `DisclosureGroup`).

### Dark-mode-only

The web is dark-only. The iPad matches: `.preferredColorScheme(.dark)` on `RootView`, ignores system light/dark setting. Simplifies by eliminating the light palette.

## Testing Strategy

### Test pyramid

```
           ┌─────────────┐
           │  UI tests   │   ~20 tests (critical flows)
           └─────────────┘
          ┌───────────────┐
          │  Integration  │   ~60 tests (service + store)
          └───────────────┘
        ┌───────────────────┐
        │   Unit tests      │   ~150 tests (models, logic, helpers)
        └───────────────────┘
```

### Unit tests (`BoxBoxNowDashboardTests`)

Critical coverage:

- **Model decoding**: load real JSON recorded from the backend (`Fixtures/snapshot.json`, `update.json`, `fifo_update.json`) and verify `JSONDecoder` parses without errors.
- **`JSONValue`** helper: edge cases (null, nested, mixed array).
- **`Formatters`**: lap time (`88345ms → "1:28.345"`), gap (`"+1L"`, `"+4.123"`), cumulative time.
- **`RaceStore` reducers**: `applyUpdates(events:)` with synthetic event arrays producing expected state (TDD-friendly, no WS required).
- **`TierScoreCalculator`**: given a `[KartState]`, assign buckets tier-100/75/50/25/1 correctly (replicating `lib/tierScore.ts`).
- **Auth state machine**: transitions `loggedOut → authenticating → needsMFA → loggedIn` in each branch.

### Integration tests

- **`RaceService + APIClientMock`**: each endpoint constructs correct URL, sends headers, decodes responses.
- **`RaceWebSocketClient + protocol-based mock`**: `RaceWebSocketClient` exposes a `RaceWebSocketClientProtocol` that the `RaceStore` depends on; in tests a `MockRaceWebSocketClient` feeds hand-crafted `AsyncStream`s of messages and connection states (snapshot + updates + close `4001`) to verify `RaceStore` ends in the correct state and `AuthStore` triggers logout. Does not use `URLProtocol` (which only intercepts HTTP, not WebSocket frames).
- **`AuthStore + KeychainHelperMock`**: login → token saved, logout → token cleared.
- **Reconnect loop**: simulate 3 sequential disconnects → verify exponential backoff and fresh snapshot request on each reconnect.

### UI tests (`BoxBoxNowDashboardUITests`)

Minimum viable end-to-end flows against a stub backend:

1. Login + loggedIn: email/password → MFA → dashboard visible.
2. Sidebar navigation: tap each item → correct detail view.
3. Reconnect UI: stub forces disconnect → "Reconnecting..." banner visible → stub reconnects → banner disappears.
4. Global logout: user menu → logout → LoginView.
5. Admin gating: non-admin user → Admin section not visible in sidebar.

### Fixtures + snapshot testing

Manual one-time download from the real backend:

```bash
curl -H "Authorization: Bearer $TOKEN" https://api.../api/race/snapshot > Fixtures/snapshot.json
```

Committed under `BoxBoxNowDashboardTests/Fixtures/`. Any backward-incompatible schema change in the backend breaks a unit test immediately — explicit tripwire.

## Phased Delivery Plan (A → B → C → D)

Each phase closes with a PR, review, and a TestFlight build.

### Phase A — Shell + live data (~2-3 weeks)

**Goal**: an app that launches, logs in, and shows live race data — everything a mechanic at the pit wall needs during a race.

**Includes**:
- `BoxBoxNowDashboard` target created, Target Membership of shared Services/Models configured
- Design system foundations: colors, fonts, base components (`BBNCard`, `BBNTable`, `BBNPrimaryButton`, `BBNStatusDot`, `BBNSection`)
- Navigation: `NavigationSplitView` + `SidebarView` + `StatusBarView`
- Full auth: login, MFA, Google OAuth, Face ID quick-login, shared Keychain, logout
- Backend change: `google_callback_ios` redirects to `boxboxnow://auth/google?token=`
- `RaceWebSocketClient` (actor) + `RaceStore` + snapshot→update pipeline
- Modules: **Race, Pit, Live, Adjusted, Adjusted-Beta**, plus **Config** as a shell containing only the **Sessions** sub-tab (device sessions / logout from other devices). The other 4 Config sub-tabs (Teams, Circuits, Presets, Preferences) are deferred to Phase B.
- Reconnect loop + 4001/4003 close handling

**Out of scope for A**: Driver, Driver-Config, Replay, Analytics, Insights, Admin (all)

**Exit criteria**:
- A user can log in and watch the Race table live for 30 minutes without interruption.
- Unit + integration tests passing (>100 tests).
- TestFlight build installable on iPad Pro.

### Phase B — Full Config + Driver module (~1.5-2 weeks)

**Goal**: functional parity for entire race operations — not just monitoring but also managing teams, circuits, presets, and the pilot's live view.

**Includes**:
- **Config — remaining 4 sub-tabs** added alongside Phase A's Sessions: Teams (editable list), Circuits (selector), Presets (CRUD), Preferences (toggles + language). After Phase B, the Config module has all 5 sub-tabs.
- **Driver** (`DriverLiveView`): port existing driver-app code with adaptation (no local GPS, all values via WS)
- **Driver Config** (`DriverConfigView`): drag-to-reorder editor of the 21 cards, save per preset

**Exit criteria**:
- A user can edit teams from the iPad and the change reflects in the web in real time.
- The pilot view renders all 21 cards correctly in both 2-col portrait and 3-col landscape orientations.

### Phase C — Analysis & replay (~2 weeks)

**Goal**: full post-race analysis.

**Includes**:
- **Replay** with timeline scrubber, play/pause/speed, file selector
- **Analytics** for karts (Swift Charts line + bar, detail sheet per kart)
- **Insights** GPS with the 3 custom `Canvas` views (trajectory, speed trace, G-forces)
- Apex Replay integration (`GET /api/apex-replay/sessions`)

**Exit criteria**:
- Replay of a 1-hour race is smooth (no perceptible scrub lag).
- Insights renders +10k points without frame drops.

### Phase D — Admin (~1.5-2 weeks)

**Goal**: cover all admin-only modules.

**Includes**:
- **Admin Users**: list, inline `tabAccess` edit, `isAdmin` toggle, reset password, delete, per-user sessions
- **Admin Circuits**: full CRUD
- **Admin Hub**: multi-tenant circuit management
- **Admin Platform**: metrics (Swift Charts)

**Exit criteria**:
- An admin can create a new user from the iPad and the new user can log in immediately.
- The iPad app has reached full feature parity with the web dashboard, excluding account/subscription.

### Total estimated timeline: 7-9 weeks

Assumes solo iOS work + occasional small backend iterations (e.g., `google_callback_ios`). Each phase ends with a note in the `MEMORY.md → ios_native_app.md` file tracking status and blockers.

## Out of Scope

- "Mi cuenta" / account / subscription / billing module (explicit user requirement)
- Stripe integration
- Sign in with Apple (see rationale above)
- Push notifications (APNs)
- Multi-window / multi-scene support
- iPhone support
- Portrait orientation
- Landing page content

## Future Evolution (post-launch)

Tracked in `MEMORY.md → ios_native_app.md`:

1. **Extract shared layer to Swift Package**: once the app is stable, move `Services/`, `Models/`, and `Utilities/` from Target Membership into a local Swift Package `BoxBoxNowCore` inside the workspace. Benefits: isolated build, isolated tests, easier addition of future targets (widget, watchOS).
2. **Consolidate `WebSocketClient.swift` + `RaceWebSocketClient.swift`**: the dashboard introduces a new actor-based `RaceWebSocketClient` while the driver app keeps using the existing `WebSocketClient`. After the dashboard is in production and the driver app's next feature cycle, migrate the driver to the actor-based client and delete the legacy one. Tracked as tech debt.
3. **Reintroduce Sign in with Apple** if App Store review requires it for the dashboard.
4. **Multi-window support**: let users drag a module into a separate scene for dual monitoring (Race + Pit in parallel).
5. **Local notifications for BOX call** when the iPad is briefly backgrounded.

## Open Questions / Assumptions

- **Assumption**: the backend's WebSocket accepts `device=web` from non-browser clients without additional validation. To be verified in Phase A by a quick stub test; if it rejects, add the iPad's user-agent to the whitelist.
- **Assumption**: `GET /api/auth/google/ios` and `GET /api/auth/google/callback/ios` are functional in the current backend (only the final redirect URL needs changing). To be verified by reading `auth_routes.py:737` in detail before starting Phase A.
- **Assumption**: Swift Charts on iOS 17 can handle ~1000 points in a line chart at 60fps without optimization. If not, fall back to a `Canvas`-based renderer for Analytics charts.
- **Assumption**: the web's `useRaceStore` field definitions fully cover the data required by all 15 modules — no other stores exist that the iPad would need to replicate. To be verified by a final audit before Phase A.
