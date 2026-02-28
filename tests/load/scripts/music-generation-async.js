import http from 'k6/http';
import { check, sleep } from 'k6';
import { authenticate } from '../helpers/auth.js';

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '30s', target: 5 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.10'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  const token = authenticate(BASE_URL);

  const submitRes = http.post(
    `${BASE_URL}/api/v1/music/generate`,
    JSON.stringify({
      prompt: 'calm meditation music',
      style: 'ambient',
      duration: 30,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  check(submitRes, {
    'generation submitted': r => r.status === 200 || r.status === 202,
    'has job id': r => {
      const body = r.json();
      return body?.data?.jobId != null || body?.jobId != null;
    },
  });

  const jobId = submitRes.json()?.data?.jobId || submitRes.json()?.jobId;
  if (jobId) {
    for (let i = 0; i < 10; i++) {
      sleep(2);
      const pollRes = http.get(`${BASE_URL}/api/v1/music/generate/status/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      check(pollRes, {
        'poll status ok': r => r.status === 200,
      });
      const status = pollRes.json()?.data?.status || pollRes.json()?.status;
      if (status === 'completed' || status === 'failed') break;
    }
  }

  sleep(1);
}
