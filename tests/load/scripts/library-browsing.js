import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { guestAuth, authHeaders } from '../helpers/auth.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

const listDuration = new Trend('library_list_duration');
const detailDuration = new Trend('library_detail_duration');

export const options = {
  stages: [
    { duration: '15s', target: 20 },
    { duration: '45s', target: 20 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    library_list_duration: ['p(95)<600'],
    library_detail_duration: ['p(95)<400'],
  },
};

export default function () {
  const auth = guestAuth(BASE_URL);
  if (!auth) return;

  const opts = authHeaders(auth.token);

  const startList = Date.now();
  const listRes = http.get(`${BASE_URL}/api/app/library/books`, opts);
  listDuration.add(Date.now() - startList);

  check(listRes, {
    'library list status': (r) => r.status === 200 || r.status === 304,
  });

  sleep(0.5);

  if (listRes.status === 200) {
    try {
      const body = JSON.parse(listRes.body);
      const books = body.data || body.books || [];
      if (books.length > 0) {
        const bookId = books[0].id;
        const startDetail = Date.now();
        const detailRes = http.get(`${BASE_URL}/api/app/library/books/${bookId}`, opts);
        detailDuration.add(Date.now() - startDetail);

        check(detailRes, {
          'book detail status': (r) => r.status === 200,
        });
      }
    } catch (e) {
      // Response parsing failed - continue
    }
  }

  sleep(1);
}
