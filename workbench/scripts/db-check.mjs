// Quick DB check: project urlId + message sizes for the sampling account.
// Run: node scripts/db-check.mjs [username]
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(new URL('../prisma/a2.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const username = process.argv[2] ?? 'perfovtk4l';

// slug census: global urlId collisions block every later PUT with 409
const slugs = db
  .prepare('SELECT urlId, COUNT(*) AS n FROM Project GROUP BY urlId ORDER BY n DESC LIMIT 15')
  .all();
console.log('slug census:', JSON.stringify(slugs));

const todoSlugs = db
  .prepare("SELECT p.urlId, p.id, u.username FROM Project p JOIN User u ON u.id = p.userId WHERE p.urlId LIKE '%todo%' OR p.urlId LIKE '%stopwatch%' OR p.urlId LIKE '%simple-vite%'")
  .all();
console.log('known-artifact-slug owners:', JSON.stringify(todoSlugs, null, 1));

const user = db.prepare('SELECT id FROM User WHERE username = ?').get(username);

if (!user) {
  console.log('user not found:', username);
  process.exit(0);
}

const projects = db.prepare('SELECT id, urlId, description, updatedAt FROM Project WHERE userId = ?').all(user.id);

for (const p of projects) {
  console.log(`project id=${p.id} urlId=${p.urlId} desc=${JSON.stringify(p.description)} updatedAt=${p.updatedAt}`);
  const messages = db.prepare('SELECT seq, role, length(content) AS len FROM Message WHERE projectId = ? ORDER BY seq').all(p.id);

  for (const m of messages) {
    console.log(`  seq=${m.seq} role=${m.role} len=${m.len}`);
  }
}
