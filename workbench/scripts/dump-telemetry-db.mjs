// Dump persisted messages/annotations for the telemetry sampling account.
// Run: node scripts/dump-telemetry-db.mjs [username]
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.join(os.tmpdir(), 'a2-telemetry-sample');
fs.mkdirSync(OUT, { recursive: true });

const db = new DatabaseSync(new URL('../prisma/a2.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const username = process.argv[2] ?? 'perfoto4u5';

const user = db.prepare('SELECT * FROM User WHERE username = ?').get(username);

if (!user) {
  console.log('user not found:', username);
  process.exit(1);
}

const projects = db.prepare('SELECT id, urlId, description, createdAt, updatedAt FROM Project WHERE userId = ? ORDER BY updatedAt').all(user.id);
const result = { username, projects: [] };

for (const project of projects) {
  const messages = db.prepare('SELECT id, seq, role, content, createdAt FROM Message WHERE projectId = ? ORDER BY seq').all(project.id);
  const parsed = messages.map((m) => {
    let value;

    try {
      value = JSON.parse(m.content);
    } catch {
      value = m.content;
    }

    return { id: m.id, seq: m.seq, role: m.role, createdAt: m.createdAt, value };
  });

  result.projects.push({ ...project, messages: parsed });
}

const file = path.join(OUT, 'db-dump.json');
fs.writeFileSync(file, JSON.stringify(result, null, 2));
console.log('written', file);

for (const project of result.projects) {
  console.log(`\n== ${project.description ?? project.urlId} (${project.id}) ==`);

  for (const m of project.messages) {
    const v = m.value ?? {};
    const annotations = Array.isArray(v.annotations) ? v.annotations : [];
    const kinds = annotations.map((a) => a?.type).join(',') || '-';
    const contentLen = typeof v.content === 'string' ? v.content.length : JSON.stringify(v.content ?? '').length;
    console.log(`  [${m.seq}] ${m.role} id=${m.id} len=${contentLen} annotations=[${kinds}]`);
  }
}
