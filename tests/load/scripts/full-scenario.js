import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { registerUser, loginUser, refreshToken, guestAuth, authHeaders } from '../helpers/auth.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      tags: { test_type: 'smoke' },
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      startTime: '30s',
      tags: { test_type: 'load' },
    },
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },
        { duration: '30s', target: 100 },
        { duration: '10s', target: 0 },
      ],
      startTime: '4m',
      tags: { test_type: 'spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  group('health', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, { 'health ok': (r) => r.status === 200 });
    sleep(0.2);
  });

  group('guest_auth', () => {
    const auth = guestAuth(BASE_URL);
    if (!auth) return;

    const opts = authHeaders(auth.token);

    group('browse_library', () => {
      const listRes = http.get(`${BASE_URL}/api/app/library/books`, opts);
      check(listRes, { 'library list ok': (r) => r.status === 200 || r.status === 304 });
      sleep(0.5);
    });

    group('token_refresh', () => {
      const refreshResult = refreshToken(BASE_URL, auth.refreshToken, auth.sessionId);
      check(refreshResult, { 'refresh successful': (r) => r !== null });
      sleep(0.3);
    });

    group('profile', () => {
      const profileRes = http.get(`${BASE_URL}/api/app/users/me/profile`, opts);
      check(profileRes, { 'profile ok': (r) => r.status === 200 || r.status === 401 });
      sleep(0.3);
    });
  });

  sleep(1);
}
