/**
 * bolt-rewrite: workbench API verification test script.
 *
 * Usage: node tests/workbench-api-test.mjs
 * Requires dev server at http://localhost:3000.
 *
 * Covers:
 *   POST /api/projects          — create project shell (FR-01 / D5)
 *   POST /api/workbench/token   — one-time seam token (WE-02 / D3)
 *   POST /api/workbench/artifact — artifact persistence (WE-04 / D4)
 * including anonymous / non-owner / token-misuse rejection paths.
 */

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const DB_URL = process.env.DATABASE_URL || "file:./dev.db";

const adapter = new PrismaLibSql({ url: DB_URL });
const prisma = new PrismaClient({ adapter });

let pass = 0;
let fail = 0;

function assert(label, condition, detail = "") {
  if (condition) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.error(`  FAIL ${label} ${detail}`); }
}

function parseCookies(headers) {
  const cookies = [];
  for (const [key, val] of headers) {
    if (key === "set-cookie") {
      const parts = val.split(/,(?=\s*(?:authjs|__Secure|__Host|next|connect)\.?[\w-]+=)/i);
      for (const part of parts) cookies.push(part.trim().split(";")[0]);
    }
  }
  return cookies.join("; ");
}

async function login(username, password) {
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, displayName: username }),
  }).catch(() => {});

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfBody = await csrfRes.json();
  const csrfCookies = parseCookies(csrfRes.headers);

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: csrfCookies },
    body: new URLSearchParams({ username, password, csrfToken: csrfBody.csrfToken, json: "true" }),
    redirect: "manual",
  });
  const cookie = parseCookies(loginRes.headers) || csrfCookies;
  assert(`Login ${username}`, loginRes.status === 200 || loginRes.status === 302, `status=${loginRes.status}`);
  return cookie;
}

const json = (body) => ({ "Content-Type": "application/json", body: JSON.stringify(body) });

// Sample dist tree in WebContainer export('dist', { format: 'json' }) shape
const SAMPLE_FILES = {
  "index.html": { file: { contents: "<!DOCTYPE html><h1>workbench save</h1>" } },
  assets: { directory: { "app.js": { file: { contents: "console.log(1)" } } } },
};

async function run() {
  console.log("\n=== Workbench API Tests ===\n");

  const cookie1 = await login("wbench_user1", "test1234");
  const cookie2 = await login("wbench_user2", "test1234");

  // 1. POST /api/projects
  console.log("\n1. POST /api/projects");

  const anonRes = await fetch(`${BASE}/api/projects`, { method: "POST", ...json({ prompt: "x" }) });
  assert("Anonymous -> 401", anonRes.status === 401, `status=${anonRes.status}`);

  const noPromptRes = await fetch(`${BASE}/api/projects`, {
    method: "POST", headers: { ...json({}), cookie: cookie1 }, body: JSON.stringify({}),
  });
  assert("Missing prompt -> 400", noPromptRes.status === 400);

  const createRes = await fetch(`${BASE}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie1 },
    body: JSON.stringify({ prompt: "Build a pomodoro timer app" }),
  });
  const created = await createRes.json();
  assert("Create -> 200 { projectId, status }",
    createRes.status === 200 && !!created.projectId && created.status === "generating",
    `status=${createRes.status} body=${JSON.stringify(created)}`);
  const projectId = created.projectId;

  // 2. POST /api/workbench/token
  console.log("\n2. POST /api/workbench/token");

  const anonTokRes = await fetch(`${BASE}/api/workbench/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  assert("Anonymous -> 401", anonTokRes.status === 401);

  const crossTokRes = await fetch(`${BASE}/api/workbench/token`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie2 },
    body: JSON.stringify({ projectId }),
  });
  assert("Non-owner -> 404", crossTokRes.status === 404, `status=${crossTokRes.status}`);

  const tokRes = await fetch(`${BASE}/api/workbench/token`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie1 },
    body: JSON.stringify({ projectId }),
  });
  const { token } = await tokRes.json();
  assert("Owner issues token", tokRes.status === 200 && !!token, `status=${tokRes.status}`);

  // 3. POST /api/workbench/artifact
  console.log("\n3. POST /api/workbench/artifact");

  const badTokRes = await fetch(`${BASE}/api/workbench/artifact`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie1 },
    body: JSON.stringify({ projectId, token: "no-such-token", files: SAMPLE_FILES }),
  });
  assert("Invalid token -> 403", badTokRes.status === 403, `status=${badTokRes.status}`);

  const crossSaveRes = await fetch(`${BASE}/api/workbench/artifact`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie2 },
    body: JSON.stringify({ projectId, token, files: SAMPLE_FILES }),
  });
  assert("Non-owner save -> 404", crossSaveRes.status === 404, `status=${crossSaveRes.status}`);

  const saveRes = await fetch(`${BASE}/api/workbench/artifact`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie1 },
    body: JSON.stringify({ projectId, token, files: SAMPLE_FILES }),
  });
  const saved = await saveRes.json();
  assert("Owner save -> 200 { ok, savedAt }",
    saveRes.status === 200 && saved.ok === true && !!saved.savedAt,
    `status=${saveRes.status} body=${JSON.stringify(saved)}`);

  const dbProject = await prisma.project.findUnique({ where: { id: projectId } });
  assert("DB: status completed", dbProject?.status === "completed");
  assert("DB: files JSON stored", !!dbProject?.files && JSON.parse(dbProject.files)["index.html"] !== undefined);
  assert("DB: code flattened from index.html",
    dbProject?.code === SAMPLE_FILES["index.html"].file.contents, `code=${dbProject?.code?.slice(0, 40)}`);

  const reuseRes = await fetch(`${BASE}/api/workbench/artifact`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie1 },
    body: JSON.stringify({ projectId, token, files: SAMPLE_FILES }),
  });
  assert("Token single-use (reuse -> 403)", reuseRes.status === 403, `status=${reuseRes.status}`);

  // 4. Re-issue invalidates prior token
  console.log("\n4. Token re-issue");
  const tok2Res = await fetch(`${BASE}/api/workbench/token`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie: cookie1 },
    body: JSON.stringify({ projectId }),
  });
  const { token: token2 } = await tok2Res.json();
  assert("Re-issue token", tok2Res.status === 200 && !!token2 && token2 !== token);

  // 5. Cleanup
  console.log("\n5. Cleanup");
  const delRes = await fetch(`${BASE}/api/projects/${projectId}`, { method: "DELETE", headers: { cookie: cookie1 } });
  assert("Delete test project", delRes.status === 200 || delRes.status === 204);

  await prisma.$disconnect();
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

run().catch(async (err) => {
  console.error("Test error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
