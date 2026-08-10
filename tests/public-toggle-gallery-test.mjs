/**
 * Public-toggle-and-gallery: API & gallery verification test script.
 *
 * Usage: node tests/public-toggle-gallery-test.mjs
 * Requires dev server at http://localhost:3000 and a registered user.
 * Inserts a test project directly via DB (bypasses LLM generation).
 */

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const DB_URL = process.env.DATABASE_URL || "file:./dev.db";

// ─── Prisma direct access ─────────────────────────────────
const adapter = new PrismaLibSql({ url: DB_URL });
const prisma = new PrismaClient({ adapter });

let csrfToken = "";
let cookie = "";
let pass = 0;
let fail = 0;

function assert(label, condition, detail = "") {
  if (condition) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.error(`  FAIL ${label} ${detail}`); }
}

// ─── Login ────────────────────────────────────────────────
async function login(username, password) {
  // Register (ignore error if exists)
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, displayName: "Test User" }),
  }).catch(() => {});

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfBody = await csrfRes.json();
  csrfToken = csrfBody.csrfToken;
  const csrfCookies = parseCookies(csrfRes.headers);

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: csrfCookies },
    body: new URLSearchParams({ username, password, csrfToken, json: "true" }),
    redirect: "manual",
  });
  const loginCookies = parseCookies(loginRes.headers);
  cookie = loginCookies || csrfCookies;
  assert("Login succeeds", loginRes.status === 200 || loginRes.status === 302, `status=${loginRes.status}`);
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

// ─── Insert a completed test project directly ─────────────
async function insertTestProject(userId, title = "Gallery Test Project") {
  const { v4: uuidv4 } = await import("uuid");
  const projectId = uuidv4();
  const sessionId = uuidv4();

  await prisma.project.create({
    data: {
      id: projectId,
      title,
      description: "A test project for gallery verification",
      prompt: "Create a test app",
      code: "<!DOCTYPE html><html><body><h1>Test</h1></body></html>",
      status: "completed",
      isPublic: false,
      viewCount: 0,
      tags: JSON.stringify(["工具", "测试"]),
      userId,
    },
  });

  await prisma.session.create({
    data: { id: sessionId, projectId, status: "completed" },
  });

  return projectId;
}

// ─── Get user ID from session ─────────────────────────────
async function getUserId() {
  // Fetch session page to get user info
  const res = await fetch(`${BASE}/my-projects`, { headers: { cookie } });
  if (res.status !== 200) return null;
  // We need the user ID — get it from the DB via the session
  // The session cookie maps to a user via NextAuth JWT
  // Simplest: query DB for the user we registered
  const user = await prisma.user.findUnique({ where: { username: "testuser" } });
  return user?.id ?? null;
}

function extractViewCount(html) {
  // Strip HTML comments and tags to get plain text
  const text = html.replace(/<!--[^>]*-->/g, "").replace(/<[^>]+>/g, " ");
  const m = text.match(/(\d+)\s*\u6b21\u6d4f\u89c8/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Main ─────────────────────────────────────────────────
async function run() {
  console.log("\n=== Public Toggle & Gallery Tests ===\n");

  // 1. Auth
  console.log("1. Authentication");
  await login("testuser", "test1234");

  const userId = await getUserId();
  assert("User ID found", !!userId, `userId=${userId}`);
  if (!userId) { printSummary(); return; }

  // 2. Insert test project directly
  console.log("\n2. Create test project (direct DB insert)");
  const projectId = await insertTestProject(userId, "Gallery Test Project");
  assert("Project inserted", !!projectId);

  // Also insert a second project for gallery testing
  const projectId2 = await insertTestProject(userId, "Another Public App");
  // Make second project public
  await prisma.project.update({ where: { id: projectId2 }, data: { isPublic: true, viewCount: 5, tags: JSON.stringify(["游戏", "休闲"]) } });
  assert("Second project inserted", !!projectId2);

  // 3. PATCH isPublic tests
  console.log("\n3. PATCH isPublic tests");

  // 3.1 Toggle to public on completed project
  const pubRes = await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ isPublic: true }),
  });
  const pubBody = await pubRes.json();
  assert("PATCH { isPublic: true } on completed -> 200", pubRes.status === 200, `status=${pubRes.status} body=${JSON.stringify(pubBody)}`);
  assert("Response has isPublic=true", pubBody.isPublic === true, `isPublic=${pubBody.isPublic}`);

  // 3.2 Toggle to private
  const privRes = await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ isPublic: false }),
  });
  assert("PATCH { isPublic: false } -> 200", privRes.status === 200, `status=${privRes.status}`);

  // 3.3 Invalid value
  const invalidRes = await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ isPublic: "yes" }),
  });
  assert("PATCH { isPublic: 'yes' } -> 400", invalidRes.status === 400);

  // 3.4 No fields
  const noFieldRes = await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({}),
  });
  assert("PATCH {} -> 400 NO_FIELDS", noFieldRes.status === 400);

  // 3.5 Both title and isPublic
  const bothRes = await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ title: "Renamed Test Project", isPublic: true }),
  });
  const bothBody = await bothRes.json();
  assert("PATCH { title + isPublic } -> 200", bothRes.status === 200);
  assert("Both fields updated", bothBody.title === "Renamed Test Project" && bothBody.isPublic === true);

  // 3.6 CANNOT_PUBLISH_INCOMPLETE — insert a "generating" project
  const genProjectId = await insertGeneratingProject(userId);
  const genRes = await fetch(`${BASE}/api/projects/${genProjectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ isPublic: true }),
  });
  const genBody = await genRes.json();
  assert("PATCH { isPublic: true } on generating -> 400 CANNOT_PUBLISH_INCOMPLETE",
    genRes.status === 400 && genBody.code === "CANNOT_PUBLISH_INCOMPLETE",
    `status=${genRes.status} code=${genBody.code}`);
  // Clean up generating project
  await prisma.project.delete({ where: { id: genProjectId } });

  // 4. viewCount tests
  console.log("\n4. viewCount tests");

  // Project is public at this point (from step 3.5)
  // Visit as anonymous viewer — owner is redirected to /workbench (FR-05)
  const initPageRes = await fetch(`${BASE}/projects/${projectId}`);
  const initHtml = await initPageRes.text();
  const initViews = extractViewCount(initHtml);
  assert("viewCount visible on detail page", initViews !== null, `extracted=${initViews}`);

  // Visit again to increment, then check
  await new Promise((r) => setTimeout(r, 1000));
  await fetch(`${BASE}/projects/${projectId}`);
  await new Promise((r) => setTimeout(r, 1000));

  const checkRes = await fetch(`${BASE}/projects/${projectId}`);
  const checkHtml = await checkRes.text();
  const newViews = extractViewCount(checkHtml);
  assert(`viewCount incremented (${initViews} -> ${newViews})`,
    newViews !== null && initViews !== null && newViews > initViews);

  // 5. Role branching tests
  console.log("\n5. Role branching tests");

  // 5.1 Set private, anonymous -> 404
  await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ isPublic: false }),
  });
  const anonPrivRes = await fetch(`${BASE}/projects/${projectId}`);
  assert("Anonymous on private project -> 404", anonPrivRes.status === 404);

  // 5.2 Set public, anonymous -> 200
  await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ isPublic: true }),
  });
  await new Promise((r) => setTimeout(r, 500));
  const anonPubRes = await fetch(`${BASE}/projects/${projectId}`);
  assert("Anonymous on public project -> 200", anonPubRes.status === 200);

  // 5.3 Anonymous page has no controls
  const anonHtml = await anonPubRes.text();
  assert("Anonymous page has no delete button", !anonHtml.includes("删除"));
  assert("Anonymous page has no toggle", !anonHtml.includes('role="switch"'));

  // 5.4 Owner page has toggle
  const ownerRes = await fetch(`${BASE}/projects/${projectId}`, { headers: { cookie } });
  const ownerHtml = await ownerRes.text();
  assert("Owner redirected to workbench with toggle", ownerHtml.includes('role="switch"'));

  // 6. Gallery page tests
  console.log("\n6. Gallery page tests");

  const galleryRes = await fetch(`${BASE}/gallery`);
  assert("Gallery accessible without auth -> 200", galleryRes.status === 200);
  const galleryHtml = await galleryRes.text();
  assert("Gallery shows project title", galleryHtml.includes("Renamed Test Project"));
  assert("Gallery shows second project", galleryHtml.includes("Another Public App"));
  assert("Gallery has section header", galleryHtml.includes("项目画廊"));

  // 7. Cleanup
  console.log("\n7. Cleanup");
  const delRes = await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "DELETE", headers: { cookie },
  });
  assert("Delete test project 1", delRes.status === 200 || delRes.status === 204);
  const del2Res = await fetch(`${BASE}/api/projects/${projectId2}`, {
    method: "DELETE", headers: { cookie },
  });
  assert("Delete test project 2", del2Res.status === 200 || del2Res.status === 204);

  await prisma.$disconnect();
  printSummary();
}

async function insertGeneratingProject(userId) {
  const { v4: uuidv4 } = await import("uuid");
  const id = uuidv4();
  await prisma.project.create({
    data: {
      id, title: "Generating...", description: "", prompt: "test",
      code: "", status: "generating", isPublic: false, viewCount: 0,
      tags: "[]", userId,
    },
  });
  return id;
}

function printSummary() {
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

run().catch(async (err) => {
  console.error("Test error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
