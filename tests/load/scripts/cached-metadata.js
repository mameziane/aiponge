import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 20 },
    { duration: '30s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<100', 'p(99)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const METADATA_ENDPOINTS = [
  '/api/v1/catalog/genres',
  '/api/v1/catalog/moods',
  '/api/v1/catalog/book-types',
  '/api/v1/catalog/categories',
  '/api/v1/catalog/languages',
  '/api/v1/catalog/all',
];

export default function () {
  const endpoint = METADATA_ENDPOINTS[Math.floor(Math.random() * METADATA_ENDPOINTS.length)];
  const res = http.get(`${BASE_URL}${endpoint}`);

  check(res, {
    'status 200': r => r.status === 200,
    'has cache headers': r => r.headers['Cache-Control'] != null,
    'has metadata version': r => r.headers['X-Metadata-Version'] != null,
    'response is JSON': r => {
      try {
        r.json();
        return true;
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);
}
