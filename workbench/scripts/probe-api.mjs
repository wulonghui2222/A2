// Probe /api/projects directly with a session cookie to verify route behavior.
// Run: node scripts/probe-api.mjs [username] [password]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const username = process.argv[2] ?? 'perfovtk4l';
const password = process.argv[3] ?? 'perf-probe-1';

const cookieJar = {};

function pickCookies(response) {
  const setCookie = response.headers.getSetCookie?.() ?? [];

  for (const c of setCookie) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    cookieJar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
}

function cookieHeader() {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function call(method, urlPath, body) {
  const response = await fetch(BASE + urlPath, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookieHeader(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  pickCookies(response);

  const text = await response.text();
  return { status: response.status, text: text.slice(0, 400) };
}

// 1. register, then login (Remix form actions, same as the app)
for (const route of ['/register', '/login']) {
  const response = await fetch(BASE + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password, redirectTo: '/' }),
    redirect: 'manual',
  });
  pickCookies(response);
  console.log(route, response.status, 'cookies:', JSON.stringify(Object.keys(cookieJar)));
}

// 2. GET by urlId
const byUrlId = await call('GET', '/api/projects/chat-msovtn0e');
console.log('GET urlId ->', byUrlId.status, byUrlId.text.slice(0, 200));

// 3. PUT a full replacement for project 1 and read it back
const detail = byUrlId.status === 200 ? JSON.parse(await (await fetch(BASE + '/api/projects/chat-msovtn0e', { headers: { Cookie: cookieHeader() } })).text()) : null;

if (detail) {
  const messages = detail.messages.map((m, i) =>
    i === detail.messages.length - 1 && m.role === 'assistant'
      ? { ...m, content: (typeof m.content === 'string' ? m.content : '') + '\n\n[probe-marker]' }
      : m,
  );
  const put = await call('PUT', `/api/projects/${detail.id}`, { messages, urlId: detail.urlId, description: detail.description });
  console.log('PUT ->', put.status, put.text.slice(0, 120));
  const readback = await call('GET', `/api/projects/${detail.id}`);
  console.log('readback ->', readback.status, readback.text.includes('[probe-marker]') ? 'MARKER PRESENT' : readback.text.slice(0, 160));
}

// 4. dump sample log tail if present
const logFile = path.join(os.tmpdir(), 'a2-telemetry-sample', 'sample.log');

if (fs.existsSync(logFile)) {
  const lines = fs.readFileSync(logFile, 'utf8').split('\n');
  const puts = lines.filter((l) => l.includes('/api/projects') || l.includes('PUT'));
  console.log('\nsample.log PUT/project lines:', puts.length);

  for (const l of puts.slice(-20)) {
    console.log('  ', l);
  }
}
