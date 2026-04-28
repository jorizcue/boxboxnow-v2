// ws_concurrent.js — sustained WebSocket load test for /ws/race.
//
// Simulates N drivers/staff with the panel or the mobile app open during a
// race. Each VU opens one WS connection, holds it for HOLD_S seconds, and
// counts inbound messages from the server. The race-day question this
// answers is: "can my t3.small comfortably hold N persistent WS clients?"
//
// Usage:
//   PASSWORD='...' k6 run loadtest/ws_concurrent.js
//
// Tunables (env vars):
//   BASE_URL      HTTP base for login (default: https://boxboxnow.com)
//   WS_URL        WS base for the websocket connection (default: derived from BASE_URL)
//   USERNAME      login username (default: admin)
//   PASSWORD      login password (REQUIRED — no default)
//   VUS           peak concurrent virtual users (default: 50)
//   HOLD_S        seconds each VU keeps the WS open (default: 120)
//   RAMP_S        seconds to ramp up from 0 to VUS  (default: 30)
//   VIEW          "driver" or empty (default: driver — extra connection allowed)
//   DEVICE        "mobile" or "web"  (default: web)
//
// Important: the script logs in ONCE in setup() and reuses the same JWT
// across all VUs. The backend only allows multiple concurrent WS for one
// user up to `max_devices`, so create a dedicated load-test user with a
// high `max_devices` (e.g. 1000) before running this. Or use an admin
// account, which bypasses the device check.

import http from 'k6/http';
import ws from 'k6/ws';
import { check, fail } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://boxboxnow.com').replace(/\/$/, '');
const WS_URL = (__ENV.WS_URL || BASE_URL.replace(/^http/, 'ws')).replace(/\/$/, '');
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD;
const VUS = parseInt(__ENV.VUS || '50');
const HOLD_S = parseInt(__ENV.HOLD_S || '120');
const RAMP_S = parseInt(__ENV.RAMP_S || '30');
const VIEW = __ENV.VIEW || 'driver';
const DEVICE = __ENV.DEVICE || 'web';

// Custom metrics
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectErrors = new Counter('ws_connect_errors');
const wsCloseErrors = new Counter('ws_close_errors');
const wsConnectSuccess = new Rate('ws_connect_success');
const wsFirstMessageMs = new Trend('ws_first_message_ms', true);

export const options = {
  scenarios: {
    sustain: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_S}s`, target: VUS },     // ramp-up
        { duration: `${HOLD_S}s`, target: VUS },     // hold steady
        { duration: '10s', target: 0 },              // ramp-down
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // Connection-establishment health: >=99% should succeed.
    'ws_connect_success': ['rate>0.99'],
    // First message after handshake should arrive in under 3s p95.
    'ws_first_message_ms': ['p(95)<3000'],
    // Sanity: at least one inbound message across all VUs (otherwise the
    // backend is mute and the test isn't measuring what we think).
    'ws_messages_received': ['count>0'],
  },
  // Reduce noise: don't spam stdout per request.
  noConnectionReuse: false,
};

export function setup() {
  if (!PASSWORD) {
    fail('PASSWORD env var is required (e.g. PASSWORD=xxx k6 run ...)');
  }
  console.log(`Logging in as ${USERNAME} at ${BASE_URL}…`);
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) {
    fail(`Login failed (${res.status}): ${res.body}`);
  }
  const body = JSON.parse(res.body);
  if (!body.access_token) {
    fail(`Login response had no access_token: ${res.body}`);
  }
  console.log(`Login OK. Will spawn up to ${VUS} VUs over ${RAMP_S}s, hold ${HOLD_S}s.`);
  return { token: body.access_token };
}

export default function (data) {
  const url =
    `${WS_URL}/ws/race` +
    `?token=${data.token}` +
    `&device=${encodeURIComponent(DEVICE)}` +
    (VIEW ? `&view=${encodeURIComponent(VIEW)}` : '');

  const startedAt = Date.now();
  let firstMessageRecorded = false;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      wsConnectSuccess.add(1);
    });

    socket.on('message', () => {
      wsMessagesReceived.add(1);
      if (!firstMessageRecorded) {
        wsFirstMessageMs.add(Date.now() - startedAt);
        firstMessageRecorded = true;
      }
    });

    socket.on('error', (e) => {
      wsCloseErrors.add(1);
      console.warn(`VU ${__VU}: WS error: ${e}`);
    });

    // Close after HOLD_S seconds. We start the timer at connection open
    // so the actual hold time matches the env knob regardless of how long
    // the handshake took.
    socket.setTimeout(() => socket.close(1000, 'test done'), HOLD_S * 1000);
  });

  // ws.connect returns the underlying response. Status 101 = upgraded.
  if (!res || res.status !== 101) {
    wsConnectErrors.add(1);
    wsConnectSuccess.add(0);
    console.error(`VU ${__VU}: WS handshake failed (status=${res && res.status})`);
  }

  // Sanity-check we measured at least one inbound message. If the backend
  // doesn't push anything because the user has no active circuit/race, this
  // will fail — that's a legit reason to investigate.
  check(null, { 'received >=1 message': () => firstMessageRecorded });
}

export function teardown(data) {
  // Best-effort logout so we don't litter device sessions. Not critical.
  http.post(
    `${BASE_URL}/api/auth/logout`,
    null,
    { headers: { Authorization: `Bearer ${data.token}` } },
  );
}
