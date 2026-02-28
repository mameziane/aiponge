import { sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { registerUser, loginUser, refreshToken, guestAuth } from '../helpers/auth.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const registerDuration = new Trend('auth_register_duration');
const loginDuration = new Trend('auth_login_duration');
const refreshDuration = new Trend('auth_refresh_duration');

export const options = {
  scenarios: {
    registration: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '15s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '10s', target: 0 },
      ],
      exec: 'registrationFlow',
    },
    guest: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      exec: 'guestFlow',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],
    auth_register_duration: ['p(95)<1500'],
    auth_login_duration: ['p(95)<800'],
    auth_refresh_duration: ['p(95)<300'],
  },
};

export function registrationFlow() {
  const email = `loadtest-${__VU}-${__ITER}-${Date.now()}@test.aiponge.com`;
  const password = 'LoadTest123!';

  const startReg = Date.now();
  const regResult = registerUser(BASE_URL, email, password);
  registerDuration.add(Date.now() - startReg);

  if (!regResult) return;

  sleep(1);

  const startLogin = Date.now();
  const loginResult = loginUser(BASE_URL, email, password);
  loginDuration.add(Date.now() - startLogin);

  if (!loginResult) return;

  sleep(0.5);

  const startRefresh = Date.now();
  refreshToken(BASE_URL, loginResult.refreshToken, loginResult.sessionId);
  refreshDuration.add(Date.now() - startRefresh);

  sleep(1);
}

export function guestFlow() {
  const result = guestAuth(BASE_URL);
  if (!result) return;

  sleep(0.5);

  const refreshResult = refreshToken(BASE_URL, result.refreshToken, result.sessionId);
  if (refreshResult) {
    refreshToken(BASE_URL, refreshResult.refreshToken, refreshResult.sessionId);
  }

  sleep(1);
}
