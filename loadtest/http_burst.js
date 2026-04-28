// http_burst.js — sustained REST burst against the most-used dashboard endpoints.
//
// Simulates a swarm of users opening the dashboard at the same time. Each
// iteration is "what the browser does on dashboard load":
//
//     GET /api/auth/me            (validate token, fetch user)
//     GET /api/config/session     (current race session)
//     GET /api/config/circuits    (list of circuits)
//     GET /health                 (cheap baseline ping)
//
// Uses k6's `ramping-arrival-rate` executor: we drive a target REQUESTS-PER-
// SECOND rate, not a VU count. That's the right shape for "how many RPS can
// my server sustain before the p95 latency cliff?" questions.
//
// Usage:
//   PASSWORD='...' k6 run loadtest/http_burst.js
//
// Tunables (env vars):
//   BASE_URL    HTTP base                   (default: https://boxboxnow.com)
//   USERNAME    login username              (default: admin)
//   PASSWORD    login password              (REQUIRED)
//   PEAK_RPS    peak iterations per second  (default: 30)
//   STAGE_S     seconds per ramp stage      (default: 30)
//   HOLD_S      seconds at peak             (default: 60)
//
// Total duration ≈ 3 * STAGE_S + HOLD_S (e.g. 30+60+30+60+30 = 210s by default).

import http from 'k6/http';
import { check, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://boxboxnow.com').replace(/\/$/, '');
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD;
const PEAK_RPS = parseInt(__ENV.PEAK_RPS || '30');
const STAGE_S = parseInt(__ENV.STAGE_S || '30');
const HOLD_S = parseInt(__ENV.HOLD_S || '60');

// Custom metrics — separated per endpoint so the summary tells you which
// one is the bottleneck (very common: /me is fast, /session is slow).
const meDuration = new Trend('endpoint_me_ms', true);
const sessionDuration = new Trend('endpoint_session_ms', true);
const circuitsDuration = new Trend('endpoint_circuits_ms', true);
const healthDuration = new Trend('endpoint_health_ms', true);
const errors = new Rate('endpoint_errors');

export const options = {
  scenarios: {
    burst: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      // VU pool: arrival-rate spawns VUs as needed up to maxVUs.
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { duration: `${STAGE_S}s`, target: Math.ceil(PEAK_RPS / 3) },
        { duration: `${STAGE_S}s`, target: Math.ceil((PEAK_RPS * 2) / 3) },
        { duration: `${STAGE_S}s`, target: PEAK_RPS },
        { duration: `${HOLD_S}s`,  target: PEAK_RPS },   // hold at peak
        { duration: `${STAGE_S}s`, target: 0 },          // ramp-down
      ],
    },
  },
  thresholds: {
    // No more than 1% of requests should fail.
    'endpoint_errors': ['rate<0.01'],
    // Warm endpoints should stay snappy; if not, the t3.small is choking.
    'endpoint_me_ms':       ['p(95)<800'],
    'endpoint_session_ms':  ['p(95)<1000'],
    'endpoint_circuits_ms': ['p(95)<1500'],
    'endpoint_health_ms':   ['p(95)<300'],
  },
};

export function setup() {
  if (!PASSWORD) {
    fail('PASSWORD env var is required (e.g. PASSWORD=xxx k6 run ...)');
  }
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) {
    fail(`Login failed (${res.status}): ${res.body}`);
  }
  const token = JSON.parse(res.body).access_token;
  if (!token) {
    fail(`Login response had no access_token: ${res.body}`);
  }
  return { token };
}

function authedGet(path, token, name) {
  return http.get(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint: name },
  });
}

export default function (data) {
  const t = data.token;

  const me = authedGet('/api/auth/me', t, 'me');
  meDuration.add(me.timings.duration);
  errors.add(me.status >= 400);
  check(me, { 'me 200': (r) => r.status === 200 });

  const session = authedGet('/api/config/session', t, 'session');
  sessionDuration.add(session.timings.duration);
  errors.add(session.status >= 400);
  check(session, { 'session 200': (r) => r.status === 200 });

  const circuits = authedGet('/api/config/circuits', t, 'circuits');
  circuitsDuration.add(circuits.timings.duration);
  errors.add(circuits.status >= 400);
  check(circuits, { 'circuits 200': (r) => r.status === 200 });

  const health = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health' } });
  healthDuration.add(health.timings.duration);
  errors.add(health.status >= 400);
  check(health, { 'health 200': (r) => r.status === 200 });
}

export function teardown(data) {
  http.post(
    `${BASE_URL}/api/auth/logout`,
    null,
    { headers: { Authorization: `Bearer ${data.token}` } },
  );
}
