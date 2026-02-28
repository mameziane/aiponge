import http from 'k6/http';
import { check } from 'k6';

export function registerUser(baseUrl, email, password) {
  const payload = JSON.stringify({
    email,
    password,
    firstName: 'Load',
    lastName: 'Test',
  });

  const res = http.post(`${baseUrl}/auth/register`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'register status 201': r => r.status === 201,
    'register has token': r => JSON.parse(r.body).token !== undefined,
    'register has refreshToken': r => JSON.parse(r.body).refreshToken !== undefined,
  });

  if (res.status === 201) {
    const body = JSON.parse(res.body);
    return {
      token: body.token,
      refreshToken: body.refreshToken,
      sessionId: body.sessionId,
      userId: body.user?.id,
    };
  }
  return null;
}

export function loginUser(baseUrl, identifier, password) {
  const payload = JSON.stringify({ identifier, password });

  const res = http.post(`${baseUrl}/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'login status 200': r => r.status === 200,
    'login has token': r => JSON.parse(r.body).token !== undefined,
  });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    return {
      token: body.token,
      refreshToken: body.refreshToken,
      sessionId: body.sessionId,
      userId: body.user?.id,
    };
  }
  return null;
}

export function refreshToken(baseUrl, refreshTk, sessionId) {
  const payload = JSON.stringify({ refreshToken: refreshTk, sessionId });

  const res = http.post(`${baseUrl}/auth/refresh`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'refresh status 200': r => r.status === 200,
    'refresh has new token': r => JSON.parse(r.body).token !== undefined,
  });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    return {
      token: body.token,
      refreshToken: body.refreshToken,
      sessionId: body.sessionId,
    };
  }
  return null;
}

export function guestAuth(baseUrl) {
  const res = http.post(`${baseUrl}/auth/guest`, '{}', {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'guest auth status 200': r => r.status === 200,
    'guest has token': r => JSON.parse(r.body).token !== undefined,
  });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    return {
      token: body.token,
      refreshToken: body.refreshToken,
      sessionId: body.sessionId,
      userId: body.user?.id,
    };
  }
  return null;
}

export function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}
