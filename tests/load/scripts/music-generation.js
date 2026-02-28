import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { guestAuth, authHeaders } from '../helpers/auth.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const requestDuration = new Trend('music_request_duration');
const pollDuration = new Trend('music_poll_duration');

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '60s', target: 5 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.10'],
    music_request_duration: ['p(95)<3000'],
    music_poll_duration: ['p(95)<500'],
  },
};

export default function () {
  const auth = guestAuth(BASE_URL);
  if (!auth) return;

  const opts = authHeaders(auth.token);

  const requestPayload = JSON.stringify({
    prompt: 'A relaxing ambient track for meditation',
    genre: 'ambient',
    mood: 'calm',
    duration: 30,
  });

  const startRequest = Date.now();
  const createRes = http.post(`${BASE_URL}/api/app/music/generate`, requestPayload, opts);
  requestDuration.add(Date.now() - startRequest);

  check(createRes, {
    'music request accepted': r => r.status === 200 || r.status === 201 || r.status === 202,
  });

  if (createRes.status >= 200 && createRes.status < 300) {
    try {
      const body = JSON.parse(createRes.body);
      const requestId = body.requestId || body.data?.requestId;

      if (requestId) {
        for (let i = 0; i < 5; i++) {
          sleep(2);
          const startPoll = Date.now();
          const pollRes = http.get(`${BASE_URL}/api/app/music/status/${requestId}`, opts);
          pollDuration.add(Date.now() - startPoll);

          check(pollRes, {
            'poll status ok': r => r.status === 200,
          });

          if (pollRes.status === 200) {
            const status = JSON.parse(pollRes.body);
            if (status.status === 'completed' || status.status === 'failed') break;
          }
        }
      }
    } catch (e) {
      // Response parsing failed - continue
    }
  }

  sleep(2);
}
