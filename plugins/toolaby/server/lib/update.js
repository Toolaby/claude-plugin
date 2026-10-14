// Whether a newer toolaby is out: npm's latest, asked at most once a day and remembered beside the sessions
// (~/.config/toolaby/update-check.json). Asked while the command works and never waited on for long: an answer that is
// late or missing says nothing, and the next run asks again. Off in CI and with TOOLABY_NO_UPDATE_CHECK=1 (5 Oct 2026).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { olderThan } from './check-wall.js';

const DAY = 24 * 60 * 60 * 1000;
const SEMVER = /^\d+\.\d+\.\d+$/;
/** npm's dist-tags for the package: a few bytes, `{"latest":"1.13.0"}`. */
export const LATEST_URL = 'https://registry.npmjs.org/-/package/toolaby/dist-tags';

/**
 * Starts the check and hands back `newer(wait)`: the newer version once it is known within `wait` ms, else null.
 * Nothing it does can fail the command or slow it more than `wait`; the request itself gives up after `ms`.
 */
export function startUpdateCheck({ version, configDir, env = process.env, now = Date.now(), fetchImpl = globalThis.fetch, ms = 1500 }) {
  const none = async () => null;
  if (env.CI || env.TOOLABY_NO_UPDATE_CHECK === '1' || !SEMVER.test(String(version))) return none;
  const file = join(configDir, 'update-check.json');
  let cached = null;
  try { cached = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  const fresh = cached && typeof cached.latest === 'string' && SEMVER.test(cached.latest) && typeof cached.at === 'number' && cached.at <= now && now - cached.at < DAY;
  const asked = fresh ? Promise.resolve(cached.latest) : (async () => {
    const res = await fetchImpl(LATEST_URL, { signal: AbortSignal.timeout(ms), headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const latest = JSON.parse((await res.text()).slice(0, 4096))?.latest;
    if (typeof latest !== 'string' || !SEMVER.test(latest)) return null;
    try {
      mkdirSync(configDir, { recursive: true, mode: 0o700 });
      writeFileSync(file, `${JSON.stringify({ latest, at: now })}\n`, { mode: 0o600 });
    } catch { /* remembered next time instead */ }
    return latest;
  })().catch(() => null);
  return async (wait = 500) => {
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(null), wait); timer.unref?.(); });
    const latest = await Promise.race([asked, late]);
    clearTimeout(timer);
    return latest && olderThan(version, latest) ? latest : null;
  };
}
