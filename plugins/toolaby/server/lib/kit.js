// What the kit's operations do beyond one call to Toolaby (lib/ops.js `local`): the docs and their search, the check, a
// sign-in that never holds an agent's shell, a test licence kept for `check --as`, Copy to Live across both sessions, an
// API key written into an env file, and `agents`, which registers the MCP server in every coding agent on the machine.
// bin.mjs hands in what it owns — the API helper, the sessions — and the MCP server and the command line share the rest.

import { readFileSync, writeFileSync, existsSync, mkdirSync, lstatSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fetchBounded, signInPage, devicePolling, oneLine } from './safe.js';
import { runCheck } from './check.js';
import { saveTestLicence } from './test-licences.js';

export const WALLS = { test: 'https://toolaby.app/test', live: 'https://toolaby.app' };
const CLIENT_ID = 'toolaby-cli';

/**
 * The context the operations run in. `deps`: { wall, side, api(path, { method, body, token, base }), storedToken(),
 * tokenFor(base), saveSession(base, token, email), configDir }.
 */
export function kitContext(deps) {
  const { wall, side, api, storedToken, configDir } = deps;
  let pendingSignIn = null; // { url, code, until, done }

  const docs = async (page) => {
    const clean = typeof page === 'string' ? page.replace(/^\/+|\.md$|\/+$/g, '').replace(/^docs\//, '') : '';
    if (clean && !/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(clean)) return { ok: false, status: 400, json: { message: 'A page is a path like "gating" or "reference/client".' } };
    // Toolaby's own pages, a few megabytes at most: a redirect elsewhere handed an agent any host's page as the docs (25 Sep 2026).
    const read = (path) => fetchBounded(path ? `${wall}/docs/${path}.md` : `${wall}/llms.txt`, { limit: 4 * 1024 * 1024 }).catch(() => ({ ok: false, status: 0, body: null }));
    let res = await read(clean);
    // "webhooks", "api", "client": the reference pages are under reference/, where an agent asking by the word alone found
    // nothing twice in one task (2 Oct 2026).
    if (res.status === 404 && clean && !clean.includes('/')) { const ref = await read(`reference/${clean}`); if (ref.ok) res = ref; }
    if (res.ok && !res.body) return { ok: false, status: 413, json: { message: 'The docs page is larger than any Toolaby serves.' } };
    const text = res.body ? res.body.toString('utf8') : '';
    return res.ok ? { ok: true, status: res.status, text } : { ok: false, status: res.status, json: { message: res.status === 404 ? `No docs page "${clean}". toolaby_search_docs finds one; toolaby_docs without a page lists them all.` : `The docs answered HTTP ${res.status}.` } };
  };

  /** The docs' own search (/api/search), by page, as the remote docs server answers it. */
  const searchDocs = async (query) => {
    const q = String(query ?? '').trim().slice(0, 200);
    if (q.length < 2) return { ok: false, status: 400, json: { message: 'Search for two characters or more.' } };
    const res = await fetchBounded(`${wall}/api/search?query=${encodeURIComponent(q)}`, { limit: 1024 * 1024 }).catch(() => ({ ok: false, status: 0, body: null }));
    let hits = [];
    try { hits = res.ok && res.body ? JSON.parse(res.body.toString('utf8')) : []; } catch { hits = []; }
    if (!res.ok) return { ok: false, status: res.status || 502, json: { message: `The docs' search answered HTTP ${res.status}.` } };
    const pages = new Map();
    for (const h of Array.isArray(hits) ? hits : []) {
      const url = typeof h?.url === 'string' ? h.url.replace(/^\/test(?=\/docs)/, '') : '';
      const path = url.split('#')[0];
      if (!/^\/docs(\/[a-z0-9/-]+)?$/.test(path)) continue;
      if (!pages.has(path)) { if (pages.size >= 6) continue; pages.set(path, { page: path.replace(/^\/docs\/?/, '') || 'index', url: `${wall}${path}.md`, passages: [] }); }
      const text = String(h.content ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
      const entry = pages.get(path);
      if (text && entry.passages.length < 3 && !entry.passages.includes(text)) entry.passages.push(text);
    }
    return { ok: true, status: 200, json: { query: q, results: [...pages.values()], next: pages.size ? 'Read a page with toolaby_docs { page }.' : 'Nothing matched: try other words, or toolaby_docs without a page for the index.' } };
  };

  const check = async (a) => {
    const folder = resolve(a.folder ?? '.');
    if (!existsSync(folder)) return { ok: false, status: 400, json: { message: `No folder at ${folder}.` } };
    const result = await runCheck({ folder, side, wall, api: (path, o = {}) => api(path, o), token: storedToken, built: a.built ?? null, browser: !!a.browser || !!a.as, as: a.as ?? null, json: true, log: (s) => process.stderr.write(`${s}\n`) });
    return { ok: true, status: 200, json: result };
  };

  /** Device sign-in that never waits in the foreground: the link and code now, the session once the person approves. */
  const signIn = async () => {
    const token = storedToken();
    if (token) {
      const me = await api('/api/cli/me', { token });
      if (me.ok) return { ok: true, status: 200, json: { signedIn: true, email: me.json.email, message: `Signed in to Toolaby (${side}) as ${me.json.email}.` } };
    }
    if (pendingSignIn && !pendingSignIn.done && pendingSignIn.until > Date.now()) {
      return { ok: true, status: 200, json: { signedIn: false, url: pendingSignIn.url, code: pendingSignIn.code, expiresIn: Math.round((pendingSignIn.until - Date.now()) / 1000), message: `Still waiting: ask the person to open ${pendingSignIn.url} and approve the code ${pendingSignIn.code}. Call toolaby_sign_in again to see whether they have.` } };
    }
    const started = await startDeviceSignIn(deps);
    if (!started.ok) return { ok: false, status: started.status ?? 502, json: { message: started.message } };
    pendingSignIn = { url: started.url, code: started.code, until: Date.now() + started.lasts, done: false };
    const flow = pendingSignIn;
    // Asked in the background until approved, denied or expired; the session is stored as `login` stores it.
    void pollDeviceSignIn(deps, started).then((r) => { flow.done = true; if (!r.ok) process.stderr.write(`[toolaby] sign-in: ${r.message}\n`); });
    return { ok: true, status: 200, json: { signedIn: false, url: started.url, code: started.code, expiresIn: Math.round(started.lasts / 1000), message: `Ask the person to open ${started.url} and approve the code ${started.code} (it expires in ${Math.round(started.lasts / 60_000)} minutes). Then call toolaby_sign_in again, or any tool.` } };
  };

  const testUnlock = async (a) => {
    if (side === 'Live') return { ok: false, status: 404, json: { message: 'A test licence is made on Test only.' } };
    const res = await api(`/api/cli/tools/${encodeURIComponent(a.tool)}/test-licence`, { method: 'POST', body: a.plan ? { plan: a.plan } : {} });
    if (res.ok && res.json.licence?.key) saveTestLicence(configDir, wall, a.tool, res.json.licence);
    return res;
  };

  /** Copy to Live: the snapshot Test signs, carried to Live with the Live session (wall app/api/cli/copy). */
  const copyToLive = async (a) => {
    const pair = sidesOf(wall, side);
    if (!pair) return { ok: false, status: 400, json: { message: 'Copy to Live needs to know both sides: set TOOLABY_LIVE_SERVER to the Live address of this development server.' } };
    const testToken = deps.tokenFor(pair.test);
    const liveToken = deps.tokenFor(pair.live);
    if (!testToken) return { ok: false, status: 401, json: { message: 'Not signed in on Test: `npx -y toolaby@latest login`, then copy again.' } };
    if (!liveToken) return { ok: false, status: 401, json: { message: 'Not signed in on Live: the person runs `npx -y toolaby@latest login --live` once (or toolaby_sign_in on a server started with --live), then copy again.' } };
    const snap = await api(`/api/cli/tools/${encodeURIComponent(a.tool)}/snapshot`, { base: pair.test, token: testToken });
    if (!snap.ok) return snap;
    const res = await api('/api/cli/copy', { base: pair.live, token: liveToken, method: 'POST', raw: snap.json.body, headers: { 'X-Peer-Ts': snap.json.ts, 'X-Peer-Sig': snap.json.sig } });
    if (!res.ok) return res;
    const slug = res.json.slug ?? a.tool;
    return { ok: true, status: 200, json: { ...res.json, message: `On Live${res.json.made ? ` with ${res.json.made} price${res.json.made === 1 ? '' : 's'} made` : ''}${res.json.kept ? `, ${res.json.kept} kept` : ''}.${res.json.skipped ? ` ${res.json.skipped}` : ''}${res.json.freePlan ? ` ${res.json.freePlan}` : ''}`, next: `In the extension's folder: \`npx -y toolaby@latest upgrade ${slug} --live\` writes the Live key; then build and \`npx -y toolaby@latest pack\`.` } };
  };

  /** A server API key, written into an env file and never shown (wall app/api/cli/api-keys). */
  const apiKey = async (a) => {
    const file = resolve(String(a.envFile ?? ''));
    const refused = envFileRefusal(file, 'the key');
    if (refused) return { ok: false, status: 400, json: { message: refused } };
    const res = await api('/api/cli/api-keys', { method: 'POST', body: { workspace: a.workspace, name: a.name } });
    if (!res.ok) return res;
    if (typeof res.json.key !== 'string' || !API_KEY.test(res.json.key)) return { ok: false, status: 502, json: { message: 'Toolaby answered without a key; nothing was written.' } };
    // The key, and the address it is sent to on this side: an agent guessed `/api/v1` against `/test/api/v1` (2 Oct 2026).
    // The address is checked as the key is: `^https?://` alone let a line break and a line of Toolaby's own through.
    const apiUrl = res.json.apiBase ?? null;
    if (apiUrl !== null && (typeof apiUrl !== 'string' || !API_ADDRESS.test(apiUrl))) return { ok: false, status: 502, json: { message: 'Toolaby answered an API address that is not one; nothing was written.' } };
    const wrote = setEnvValues(file, { TOOLABY_API_KEY: res.json.key, ...(apiUrl ? { TOOLABY_API_URL: apiUrl } : {}) });
    return { ok: true, status: 200, json: { ok: true, envFile: file, variable: 'TOOLABY_API_KEY', apiUrl, workspace: res.json.workspace, gitignored: wrote.gitignored, message: `A key for ${res.json.workspace} is in ${file} as TOOLABY_API_KEY${wrote.replaced.TOOLABY_API_KEY ? ', replacing the one there' : ''}, and the API's address for this side as TOOLABY_API_URL (${apiUrl ?? 'see the docs'}): requests go to \`\${TOOLABY_API_URL}/tools/<tool>/customers/<email>\` with \`Authorization: Bearer \${TOOLABY_API_KEY}\`. The key is not shown here or anywhere else.${wrote.gitignored ? '' : ` ${basename(file)} is not in .gitignore: add it before you commit.`}` } };
  };

  /**
   * A webhook endpoint registered for the developer's server (wall app/api/cli/webhooks/endpoints), its signing secret
   * written into an env file as TOOLABY_WEBHOOK_SECRET and never shown: as `webhooks add --env-file` does.
   */
  const addWebhook = async (a) => {
    const file = resolve(String(a.envFile ?? ''));
    const refused = envFileRefusal(file, 'the signing secret');
    if (refused) return { ok: false, status: 400, json: { message: refused } };
    const res = await api('/api/cli/webhooks/endpoints', { method: 'POST', body: { url: a.url, description: a.description ?? '', events: Array.isArray(a.events) ? a.events : [], workspace: a.workspace } });
    if (!res.ok) return res;
    if (typeof res.json.secret !== 'string' || !WEBHOOK_SECRET.test(res.json.secret)) return { ok: false, status: 502, json: { message: `Toolaby registered ${res.json.id ?? 'the endpoint'} but answered without its secret; nothing was written. \`npx -y toolaby@latest webhooks remove ${res.json.id ?? '<id>'}\`, then add it again.` } };
    const wrote = setEnvValues(file, { TOOLABY_WEBHOOK_SECRET: res.json.secret });
    const { secret: _secret, ...said } = res.json;
    return { ok: true, status: 200, json: { ...said, ok: true, envFile: file, variable: 'TOOLABY_WEBHOOK_SECRET', gitignored: wrote.gitignored, message: `Registered ${res.json.id} → ${res.json.url} for ${res.json.workspace} (${side}). Its signing secret is in ${file} as TOOLABY_WEBHOOK_SECRET${wrote.replaced.TOOLABY_WEBHOOK_SECRET ? ', replacing the one there' : ''}; it is not shown here or anywhere else. \`toolaby_send_test_event\` sends an example to it.${wrote.gitignored ? '' : ` ${basename(file)} is not in .gitignore: add it before you commit.`}` } };
  };

  return { api, docs, searchDocs, check, signIn, testUnlock, copyToLive, apiKey, addWebhook };
}

// ── What an env file is given ────────────────────────────────────────────────────────────────────────────────────────
// A Toolaby server at another address (--server, TOOLABY_SERVER) answered a webhook secret, or the API's address, with a line break
// in it, and lines of its choosing went into the developer's .env under names of their own; and `webhooks add
// --env-file` wrote through a link to wherever it pointed. Every write checks both, here, whoever asks.

/** A name, and a value of one line with no control character in it: dotenv reads U+2028 and U+2029 as line breaks too. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_VALUE = /^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]+$/;

/**
 * What Toolaby answers, in the alphabets it makes them in, which no env reader, nor a shell that sources the file, takes
 * for more than a value: an API key is a prefix and letters (Better Auth's), a signing secret whsec_ and base64 (Svix's),
 * the API's address an http(s) origin and a plain path.
 */
export const API_KEY = /^[A-Za-z0-9_-]{16,}$/;
export const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9+/=_-]+$/;
export const API_ADDRESS = /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~-]+)*\/?$/;

/**
 * Why `file` may not take `what`, or null: a file that is not an env file by its name, or a symbolic link, which takes
 * a write wherever it points — as `inside()` refuses for every other file the command writes (lib/safe.js).
 */
export function envFileRefusal(file, what) {
  if (!/env/i.test(basename(file))) return `Name an env file, like .env or .env.local: ${what} is written there and nowhere else.`;
  try { if (lstatSync(file).isSymbolicLink()) return `${file} is a link; name the file itself.`; } catch { /* not there yet: made when written */ }
  return null;
}

/**
 * Sets NAME=value lines in an env file — replacing a line of that name, keeping every other — written readable by its
 * owner alone. Answers whether the file is in a .gitignore. A secret goes here instead of into an agent's chat. A name
 * that is not one, a value of more than one line, or a link in the file's place: nothing is written, and it throws.
 */
export function setEnvValues(file, pairs) {
  for (const [name, value] of Object.entries(pairs)) {
    if (!ENV_NAME.test(name) || typeof value !== 'string' || !ENV_VALUE.test(value)) throw new Error(`${ENV_NAME.test(name) ? name : 'A name'} would not be one line of ${file}; nothing was written.`);
  }
  let link = false;
  try { link = lstatSync(file).isSymbolicLink(); } catch { /* not there yet: made below */ }
  if (link) throw new Error(`${file} is a link; name the file itself. Nothing was written.`);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = before ? before.replace(/\n$/, '').split('\n') : [];
  const replaced = {};
  for (const [name, value] of Object.entries(pairs)) {
    const i = lines.findIndex((l) => new RegExp(`^\\s*(export\\s+)?${name}\\s*=`).test(l));
    if (i >= 0) { lines[i] = `${name}=${value}`; replaced[name] = true; } else lines.push(`${name}=${value}`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  return { replaced, gitignored: ignored(file) };
}

/** Test and Live of the Toolaby this command line talks to: the hosted pair, or a development server's from the environment. */
export function sidesOf(wall, side) {
  if (wall === WALLS.test || wall === WALLS.live) return WALLS;
  const other = side === 'Live' ? process.env.TOOLABY_TEST_SERVER : process.env.TOOLABY_LIVE_SERVER;
  if (!other) return null;
  return side === 'Live' ? { test: other.replace(/\/+$/, ''), live: wall } : { test: wall, live: other.replace(/\/+$/, '') };
}

/** Whether a .gitignore between the file and the repository's top (or the file's folder) names it. */
function ignored(file) {
  let dir = dirname(file);
  for (let i = 0; i < 8; i++) {
    const gi = join(dir, '.gitignore');
    if (existsSync(gi)) {
      const name = basename(file);
      const rules = readFileSync(gi, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      if (rules.some((r) => { const p = r.replace(/^\//, ''); return p === name || (p.includes('*') && new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(name)); })) return true;
    }
    if (existsSync(join(dir, '.git'))) break;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return false;
}

// ── Device sign-in, split: start, and ask until done (RFC 8628) ──────────────────────────────────────────────────────
/** Starts a device sign-in: the page and code for the person, and what to ask with. */
export async function startDeviceSignIn({ api, wall }) {
  const start = await api('/api/dev-auth/device/code', { method: 'POST', body: { client_id: CLIENT_ID }, token: null });
  if (!start.ok || !start.json.device_code) return { ok: false, status: start.status, message: `Toolaby at ${wall} did not start a sign-in (HTTP ${start.status}).` };
  const { device_code: deviceCode, user_code: code, verification_uri: uri, verification_uri_complete: complete } = start.json;
  // Toolaby's own page over https (http on this machine), or nothing: an address handed over is opened by a person.
  const url = signInPage(complete || `${uri}?user_code=${encodeURIComponent(code)}`, wall);
  if (!url) return { ok: false, status: 502, message: `Toolaby at ${wall} gave a sign-in page that is not its own address over https; nothing was started.` };
  const { every, lasts } = devicePolling(start.json);
  return { ok: true, url, code: oneLine(code), deviceCode, every, lasts };
}

/** Asks until the person approves, denies, or the code expires; stores the session as `login` does. */
export async function pollDeviceSignIn({ api, saveSession, wall }, { deviceCode, every: first = 5000, lasts = 15 * 60_000 }) {
  let every = first;
  const until = Date.now() + lasts;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, Math.min(every, Math.max(0, until - Date.now()))));
    const poll = await api('/api/dev-auth/device/token', { method: 'POST', body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: CLIENT_ID }, token: null }).catch(() => ({ ok: false, json: {} }));
    if (poll.ok && poll.json.access_token) {
      const token = poll.json.access_token;
      const me = await api('/api/cli/me', { token });
      const email = me.ok ? me.json.email : null;
      saveSession(wall, token, email);
      return { ok: true, email };
    }
    const why = poll.json?.error;
    if (why === 'slow_down') every += 5000;
    else if (why === 'expired_token') return { ok: false, message: 'The code expired before it was approved.' };
    else if (why === 'access_denied') return { ok: false, message: 'The sign-in was denied in the browser.' };
    else if (why && why !== 'authorization_pending') return { ok: false, message: `Toolaby answered "${oneLine(why)}".` };
  }
  return { ok: false, message: 'The code expired before it was approved.' };
}

// ── `agents`: the MCP server registered in every coding agent here ───────────────────────────────────────────────────
const SERVER = (live) => ({ name: live ? 'toolaby-live' : 'toolaby', command: 'npx', args: ['-y', 'toolaby@latest', 'mcp', ...(live ? ['--live'] : [])] });
const which = (cmd) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' }).status === 0;
const readJson = (file) => { try { return { ok: true, value: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8') || '{}') : {} }; } catch { return { ok: false }; } };

/** Adds one server to a JSON config under `key` (mcpServers, servers), leaving the rest of the file as it was. */
function mergeServer(file, key, entry, server) {
  const read = readJson(file);
  if (!read.ok) return { failed: `${file} is not plain JSON (comments?), so it was left alone: add "${server.name}" under "${key}" by hand: ${JSON.stringify(entry)}` };
  const all = read.value && typeof read.value === 'object' ? read.value : {};
  all[key] = all[key] && typeof all[key] === 'object' ? all[key] : {};
  if (JSON.stringify(all[key][server.name]) === JSON.stringify(entry)) return { already: true };
  all[key][server.name] = entry;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
  return { done: true };
}

/**
 * Registers the MCP server (`toolaby`, and `toolaby-live` with --live) in each coding agent found, at user scope, or in
 * the project's own files with --project. Running it again changes nothing that is already right. `home` is for tests.
 */
export function setUpAgents({ clients = 'all', project = false, live = false, cwd = process.cwd(), home = homedir(), platform = process.platform, run = spawnSync } = {}) {
  const server = SERVER(live);
  const want = (c) => clients === 'all' || String(clients).split(',').map((s) => s.trim()).includes(c);
  const results = [];
  const note = (client, r, how) => results.push({ client, ...(r.failed ? { status: 'failed', why: r.failed } : r.skipped ? { status: 'skipped', why: r.skipped } : r.already ? { status: 'already', how } : { status: 'done', how }) });
  const stdio = { command: server.command, args: server.args };

  if (project) {
    if (want('claude-code') || want('vscode')) note('claude-code + vscode', mergeServer(join(cwd, '.mcp.json'), 'mcpServers', stdio, server), '.mcp.json');
    if (want('cursor')) note('cursor', mergeServer(join(cwd, '.cursor', 'mcp.json'), 'mcpServers', stdio, server), '.cursor/mcp.json');
    if (want('vscode')) note('vscode', mergeServer(join(cwd, '.vscode', 'mcp.json'), 'servers', { type: 'stdio', ...stdio }, server), '.vscode/mcp.json');
    if (want('gemini')) note('gemini', mergeServer(join(cwd, '.gemini', 'settings.json'), 'mcpServers', stdio, server), '.gemini/settings.json');
    return results;
  }
  if (want('claude-code')) {
    if (!which('claude')) note('claude-code', { skipped: 'the `claude` command is not installed' });
    else {
      const has = run('claude', ['mcp', 'get', server.name], { encoding: 'utf8' });
      if (has.status === 0) note('claude-code', { already: true }, `claude mcp (user scope)`);
      else {
        const r = run('claude', ['mcp', 'add', '--scope', 'user', server.name, '--', server.command, ...server.args], { encoding: 'utf8' });
        note('claude-code', r.status === 0 ? { done: true } : { failed: oneLine(r.stderr || r.stdout || 'claude mcp add failed') }, 'claude mcp add --scope user');
      }
    }
  }
  if (want('codex')) {
    if (!which('codex')) note('codex', { skipped: 'the `codex` command is not installed' });
    else {
      const has = run('codex', ['mcp', 'get', server.name], { encoding: 'utf8' });
      if (has.status === 0) note('codex', { already: true }, 'codex mcp');
      else {
        const r = run('codex', ['mcp', 'add', server.name, '--', server.command, ...server.args], { encoding: 'utf8' });
        note('codex', r.status === 0 ? { done: true } : { failed: oneLine(r.stderr || r.stdout || 'codex mcp add failed') }, 'codex mcp add');
      }
    }
  }
  if (want('cursor')) {
    const dir = join(home, '.cursor');
    note('cursor', existsSync(dir) ? mergeServer(join(dir, 'mcp.json'), 'mcpServers', stdio, server) : { skipped: 'Cursor is not set up here (~/.cursor)' }, '~/.cursor/mcp.json');
  }
  if (want('vscode')) {
    const dir = platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Code', 'User') : platform === 'win32' ? join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Code', 'User') : join(home, '.config', 'Code', 'User');
    note('vscode', existsSync(dir) ? mergeServer(join(dir, 'mcp.json'), 'servers', { type: 'stdio', ...stdio }, server) : { skipped: 'VS Code is not set up here' }, 'VS Code user mcp.json');
  }
  if (want('gemini')) {
    const dir = join(home, '.gemini');
    note('gemini', existsSync(dir) ? mergeServer(join(dir, 'settings.json'), 'mcpServers', stdio, server) : { skipped: 'Gemini CLI is not set up here (~/.gemini)' }, '~/.gemini/settings.json');
  }
  return results;
}
