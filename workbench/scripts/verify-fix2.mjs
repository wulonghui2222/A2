// Follow-up: raw usage annotation shape + replay round action details.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(new URL('../prisma/a2.db', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const username = process.argv[2] ?? 'perfpff44i';

const user = db.prepare('SELECT id FROM User WHERE username = ?').get(username);
const project = db.prepare('SELECT id FROM Project WHERE userId = ?').get(user.id);
const assistant = db
  .prepare("SELECT seq, content FROM Message WHERE projectId = ? AND role = 'assistant' ORDER BY seq LIMIT 1")
  .get(project.id);

const parsed = JSON.parse(assistant.content);
const usage = parsed.annotations.find((a) => a.type === 'usage');
console.log('raw usage annotation:', JSON.stringify(usage, null, 1).slice(0, 800));

const report = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'a2-telemetry-sample', 'sample-report.json'), 'utf8'));
const replay = report.projects[0].replay?.snapshot ?? {};

for (const [id, r] of Object.entries(replay)) {
  console.log(`\nreplay round ${id}: startedAt=${r.startedAt} streamEndedAt=${r.streamEndedAt} drainedAt=${r.actionsDrainedAt} finalizedAt=${r.finalizedAt}`);
  console.log('  preview:', JSON.stringify(r.preview));

  for (const a of r.actions ?? []) {
    console.log(`  action ${a.id}: type=${a.type} class=${a.commandClass ?? '-'} status=${a.status} start=${a.startedAt} end=${a.endedAt ?? '-'} exit=${a.exitCode ?? '-'}`);
  }
}
