// What `check` asks of Toolaby beyond the tool's public row: the developer's session on the side the tool KEY names —
// not the side the command was started on, so a Live key's folder is checked against Live with `check` alone — and the
// version of this command Toolaby serves. The session goes to Test's or Live's address, or to the one the developer
// named with --server, and never to an address a project's key names: a cloned project's key sent `check`'s requests
// wherever it liked (25 Sep 2026).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fetchBounded, fetchHere, readBounded } from './safe.js';

/** Test shares Live's addresses under /test (bin.mjs has the same). */
export const WALLS = { test: 'https://toolaby.app/test', live: 'https://toolaby.app' };

/** Where the command keeps its session and its caches: ~/.config/toolaby, or under XDG_CONFIG_HOME. */
export const configDir = (env = process.env) => join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'toolaby');

/** This command's own version, from its package.json. */
export function ownVersion() {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? null; } catch { return null; }
}

const address = (s) => String(s ?? '').replace(/[\t\n\r]/g, '').replace(/\/+$/, '');

/**
 * Toolaby a key's side is on: Live's or Test's address — under Toolaby the command was pointed at, when it was
 * pointed at another (a staging Toolaby server, a laptop's) — or, for a development server's key, Toolaby the command was
 * pointed at when that is not Test or Live, and null otherwise: a development key names a laptop's site, not its API.
 */
export function wallForKey(mode, wall) {
  const given = address(wall);
  if (mode === 'dev') return given && given !== WALLS.live && given !== WALLS.test ? given : null;
  const base = (given || WALLS.live).replace(/\/test$/, '');
  return mode === 'live' ? base : `${base}/test`;
}

/** The side a Toolaby server is, for every message: Live, Test, or its address. */
export const sideOf = (wall, mode = null) => (wall === WALLS.live ? 'Live' : wall === WALLS.test ? 'Test' : mode === 'live' ? 'Live' : mode === 'test' ? 'Test' : wall ?? 'a development server');

/** What --live, or --server, a command for that Toolaby server needs. */
export function wallFlag(wall, mode) {
  if (wall === WALLS.live) return ' --live';
  if (wall === WALLS.test || !wall) return mode === 'live' ? ' --live' : '';
  const base = address(wall).replace(/\/test$/, '');
  return ` --server ${base}${mode === 'live' ? ' --live' : ''}`;
}

/**
 * The developer's session for one Toolaby server, as bin.mjs keeps it: TOOLABY_TOKEN where it is meant for that Toolaby server (the one
 * TOOLABY_TOKEN_SERVER names, or Live), else the one `login` stored for it. Null when there is none.
 */
export function sessionFor(wall, { env = process.env, dir = configDir(env) } = {}) {
  const tokenWall = address(env.TOOLABY_TOKEN_SERVER || WALLS.live);
  if (env.TOOLABY_TOKEN && tokenWall === wall) return env.TOOLABY_TOKEN;
  try { return JSON.parse(readFileSync(join(dir, 'credentials.json'), 'utf8'))[wall]?.token || null; } catch { return null; }
}

/** A request to one Toolaby server with a session, answered as bin.mjs's api() answers: { status, ok, json }. */
export function wallApi(wall, token, version = ownVersion()) {
  return async (path) => {
    const res = await fetchHere(`${wall}${path}`, { ms: 30_000, wall, headers: { Accept: 'application/json', 'User-Agent': `toolaby-cli/${version}`, Authorization: `Bearer ${token}` } });
    const bytes = await readBounded(res, 4 * 1024 * 1024);
    let json = {};
    try { json = JSON.parse(bytes?.toString('utf8') ?? ''); } catch { /* not JSON: the status says what happened */ }
    return { status: res.status, ok: res.ok, json };
  };
}

/** One file of a tar archive, by its name, or null: what npm pack makes, read without a dependency. */
export function tarFile(tar, name) {
  const text = (from, to) => tar.subarray(from, to).toString('utf8').replace(/\0[\s\S]*$/, '');
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const size = parseInt(text(at + 124, at + 136).trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0) break;
    const prefix = text(at + 345, at + 500);
    const entry = text(at, at + 100);
    const body = at + 512;
    if ((prefix ? `${prefix}/${entry}` : entry) === name) return tar.subarray(body, body + size);
    at = body + Math.ceil(size / 512) * 512;
  }
  return null;
}

/** The version of the command a Toolaby server serves at /toolaby.tgz, or null when it cannot be read. */
export async function servedVersion(wall) {
  try {
    const got = await fetchBounded(`${wall}/toolaby.tgz`, { limit: 4 * 1024 * 1024, ms: 10_000 });
    if (!got.ok || !got.body) return null;
    const pkg = tarFile(gunzipSync(got.body, { maxOutputLength: 32 * 1024 * 1024 }), 'package/package.json');
    const version = pkg ? JSON.parse(pkg.toString('utf8')).version : null;
    return typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version) ? version : null;
  } catch { return null; }
}

/** Whether version `a` is older than `b`: numbers compared part by part, anything after a dash ignored. */
export function olderThan(a, b) {
  const parts = (v) => String(v).split('-')[0].split('.').map((n) => Number(n) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}
