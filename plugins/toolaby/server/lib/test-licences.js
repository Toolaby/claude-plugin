// The test licences `toolaby test-unlock` made (Test only), kept for `check --browser --as <plan>` to enter in the
// loaded extension: in the command line's own config, readable by this user alone, by Toolaby's address, tool and plan.
// A Test key unlocks a Test tool and nothing else; the newest per plan is kept.

import { readFileSync, writeFileSync, mkdirSync, chmodSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';

const fileIn = (dir) => join(dir, 'test-licences.json');
const keyOf = (wall, tool, plan) => `${String(wall).replace(/\/+$/, '')}|${tool}|${plan}`;

function readAll(dir) {
  try { const all = JSON.parse(readFileSync(fileIn(dir), 'utf8')); return all && typeof all === 'object' && !Array.isArray(all) ? all : {}; } catch { return {}; }
}

/** Keep one, the newest for its plan. */
export function saveTestLicence(dir, wall, tool, licence) {
  const all = readAll(dir);
  all[keyOf(wall, tool, licence.plan)] = { key: licence.key, email: licence.email, plan: licence.plan, features: licence.features ?? [], at: new Date().toISOString() };
  const file = fileIn(dir);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  // Written whole and then moved into place, readable by this user alone, as the session's credentials are.
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

/** The licence for this tool's plan, or null. A tool's short id finds a full one stored under it. */
export function testLicenceFor(dir, wall, tool, plan) {
  const all = readAll(dir);
  const exact = all[keyOf(wall, tool, plan)];
  if (exact) return exact;
  const base = String(wall).replace(/\/+$/, '');
  const found = Object.entries(all).find(([k]) => { const [w, t, p] = k.split('|'); return w === base && p === plan && (t === tool || t.endsWith(`--${tool}`) || tool.endsWith(`--${t}`)); });
  return found ? found[1] : null;
}
