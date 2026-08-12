// One-off verification for the B1-B5 fixes (perf-report): annotation landing + replay preview pairing.
// Run: node scripts/verify-fix.mjs [username]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(new URL('../prisma/a2.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const username = process.argv[2] ?? 'perfpff44i';

const user = db.prepare('SELECT id FROM User WHERE username = ?').get(username);
const project = db.prepare('SELECT id, urlId FROM Project WHERE userId = ?').get(user.id);
const messages = db.prepare('SELECT seq, role, content FROM Message WHERE projectId = ? ORDER BY seq').all(project.id);

console.log(`== account ${username} project ${project.id} urlId=${project.urlId} ==`);

for (const m of messages) {
  const parsed = JSON.parse(m.content);
  const annotations = Array.isArray(parsed.annotations) ? parsed.annotations : [];
  const kinds = annotations.map((a) => a?.type).join(',') || 'none';

  if (m.role === 'assistant') {
    for (const a of annotations) {
      if (a?.type === 'telemetry') {
        const v = a.value;
        console.log(
          `  seq=${m.seq} telemetry: source=${v.source} phases=${JSON.stringify(v.phases)} actions=${v.actions?.length} preview=${JSON.stringify(v.preview)}`,
        );
      }

      if (a?.type === 'usage') {
        console.log(`  seq=${m.seq} usage: ttft=${a.value?.timing?.firstVisibleTokenMs} tokens=${a.value?.tokens?.completion}`);
      }
    }
  }

  console.log(`  seq=${m.seq} role=${m.role} len=${m.content.length} annotations=[${kinds}]`);
}

// replay round preview pairing from the sampler report
const reportFile = path.join(os.tmpdir(), 'a2-telemetry-sample', 'sample-report.json');

if (fs.existsSync(reportFile)) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const entry = report.projects[0];

  for (const round of entry.rounds ?? []) {
    for (const [id, r] of Object.entries(round.snapshot ?? {})) {
      console.log(`fresh round ${id}: status=${r.status} preview=${JSON.stringify(r.preview)}`);
    }
  }

  for (const [id, r] of Object.entries(entry.replay?.snapshot ?? {})) {
    console.log(`replay round ${id}: status=${r.status} source=${r.source} preview=${JSON.stringify(r.preview)} actions=${r.actions?.length}`);
  }
}
