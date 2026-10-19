#!/usr/bin/env node
// The Toolaby command line.
//
//   toolaby login                     sign in: a code to approve in the browser (Better Auth's device flow)
//   toolaby wire <tool-id>            wire the extension in this folder to your tool — plain, WXT, CRXJS or Plasmo
//   toolaby create <tool-id>          make a new, minimal extension for your tool in <tool-id>/
//   toolaby tools                     your tools, with the ids the commands want
//   toolaby pack [folder]             the zip for the Chrome Web Store: the built extension, its manifest's key left out
//   toolaby check [--into <folder>]   whether the extension here is wired right; --browser loads it in Chromium too
//   toolaby mcp                       Toolaby for coding agents: an MCP server on stdio (lib/mcp.js)
//   toolaby webhooks events           the nine events and what each means
//   toolaby webhooks trigger <event>  send an example delivery: to your registered endpoints, or with --to straight to a local server
//   toolaby webhooks secret           this machine's development secret, which --to signs with
//   toolaby webhooks endpoints        the workspace's endpoints
//   toolaby webhooks add <url>        register an endpoint; the secret is printed once
//   toolaby webhooks remove <id>      remove one
//   toolaby whoami · logout · help
//
// Test and live, as Stripe's command line has them: every command acts on
// the TEST Toolaby server (toolaby.app/test) unless told `--live`, so the everyday
// command is the safe one and going live is a word you type on purpose.
// Signed in, the command acts as you and only on your tools, as Clerk's and
// Stripe's do: nothing is fetched for a tool your workspaces do not own. The
// session lives in ~/.config/toolaby/credentials.json (mode 600), one per
// side; a command that needs one and has none signs you in on the spot.
// `logout` revokes it on the server before forgetting it. TOOLABY_TOKEN
// stands in for the file where there is no home (CI), for one Toolaby server alone:
// Live, or the one TOOLABY_TOKEN_SERVER names. TOOLABY_SERVER or `--server <url>`
// names any other Toolaby server (a laptop's, a self-hosted one).
//
// The wiring rules — what a folder is and what its manifest needs — are the
// platform's own, carried here transpiled in lib/,
// so this and the dashboard's Wire button never disagree.
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync, lstatSync, realpathSync, chmodSync, unlinkSync, renameSync } from 'node:fs';
import { join, resolve, dirname, relative, basename, sep, posix } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { wireManifest, sitePattern, drawsItself, WORKER_LINES, wallWorkerSource, configValues, wrappedBy, namedWorker as workerIn, startsPlatform as startsWall, CLASSIC_CLIENT, parseManifest, notManifestV3 } from './lib/manifest.js';
import { wiringSummary, popupSwapIn, gatesIn, countsUses, setsUninstallPage, ownCode } from './lib/summary.js';
import { detectProject, CODE_FILES, POPUP_FILES, SIDE_PANEL_FILES, filesToWrite, fillPages, scaffoldManifest, scaffoldFilesFor, surfacesOf, hasPopup, hasSidePanel, SURFACES, STALE_FILES, BUILD_COPY_NOTE, AGENT_FILES, AGENT_ENTRY_FILES, agentWrites, accountBarIn, accountBarPages, withAccountBar } from './lib/project.js';
import { runMcp } from './lib/mcp.js';
import { startUpdateCheck } from './lib/update.js';
import { opsFor, opForWords, argsFromCli, usageOf, flagOf } from './lib/ops.js';
import { kitContext, startDeviceSignIn, pollDeviceSignIn, setUpAgents, setEnvValues, envFileRefusal, WEBHOOK_SECRET } from './lib/kit.js';
import { runCheck } from './lib/check.js';
import { switchExtPay, withoutExtPay, plansFromExtPay, extPayPlansUrl, extPayRows, extPayNotAsked } from './lib/extpay.js';
import { inside, signInPage, devicePolling, opener, privateKind, privateContent, privateCopies, googleKey, projectRoot, gitDirectory, gitObject, gitObjects, gitFile, notAnImage, unpacked, COMPRESSED, publicLinks, privateLinks, oneLine, fetchBounded, fetchHere, readBounded, readText, SCAFFOLD_FILES } from './lib/safe.js';

const VERSION = '1.16.1';
const CLIENT_ID = 'toolaby-cli';
const argv = process.argv.slice(2);
// `--version` and `--help` are commands of their own; every other command is the first bare word.
// The options that take a value, so the value is never read as a word of the command (`plan add x --amount 5`).
const VALUED = new Set(['--server', '--into', '--built', '--as', '--out', '--dir', '--surfaces', '--client', '--poll', '--to', '--secret', '--workspace', '--description', '--events', '--plan',
  ...opsFor('Test').flatMap((op) => Object.entries(op.input.properties ?? {}).filter(([n, sch]) => !op.args.includes(n) && ![].concat(sch.type ?? 'string').includes('boolean')).map(([n]) => flagOf(n)))]);
/** The words of a command line: everything that is neither an option nor an option's value. */
const wordsOf = (list) => { const w = []; for (let i = 0; i < list.length; i++) { const a = list[i]; if (a.startsWith('--')) { if (VALUED.has(a) && list[i + 1] !== undefined && !list[i + 1].startsWith('--')) i++; continue; } w.push(a); } return w; };
const command = argv.find((a) => ['--version', '-v', '--help', '-h'].includes(a)) ?? wordsOf(argv)[0] ?? 'help';
const rest = argv.filter((a) => a !== command);
// The words after the command, neither options nor their values (`webhooks add --env-file .env <url>` names the url).
const positional = wordsOf(rest);
const opt = (k, d = null) => { const i = rest.indexOf(k); return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : d; };
// `upgrade` is `wire --force`: the platform's files replaced with the current ones, the extension's own untouched.
const flag = (k) => rest.includes(k) || (k === '--force' && command === 'upgrade');
// Test shares Live's addresses under /test, as Stripe keeps both modes on its own hosts.
const WALLS = { test: 'https://toolaby.app/test', live: 'https://toolaby.app' };
const live = flag('--live');
/** What a hint adds to a command it prints, so following it acts on the side this one did. */
const liveFlag = live ? ' --live' : '';
// An address as fetch() reads it: a URL loses its tabs and line breaks when it is parsed, and kept in the name every
// message prints, a --server or a TOOLABY_SERVER with one in it drew lines of its own (25 Sep 2026).
const address = (s) => s.replace(/[\t\n\r]/g, '').replace(/\/$/, '');
const wall = address(opt('--server') ?? process.env.TOOLABY_SERVER ?? (live ? WALLS.live : WALLS.test));
/** The side, for every message: what a developer must never be unsure of. */
const side = wall === WALLS.live ? 'Live' : wall === WALLS.test ? 'Test' : wall;
// Every line leaves without terminal controls: names, paths and answers come from folders and servers this command does
// not own, and one could clear the screen, draw a fake ✓ and hide what followed (25 Sep 2026). The command writes none,
// nor any character that shows nothing — a zero width, a mark of direction, a filler — which could hide a word.
const plain = (s) => String(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u115f\u1160\u200b-\u200f\u2028-\u202e\u2060-\u2069\u2800\u3164\ufeff\uffa0]/g, '');
const out = (s = '') => console.log(plain(s));
// Colour, the command's own: put on after a piece is made plain, never taken from what it prints; off when the output is
// not a terminal, and when NO_COLOR asks (FORCE_COLOR turns it on). A line of tinted pieces goes out through `say`.
const colour = !process.env.NO_COLOR && (process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : !!process.stdout.isTTY && process.env.TERM !== 'dumb');
const tint = (code) => (s) => (colour ? `\x1b[${code}m${plain(s)}\x1b[0m` : plain(s));
const [green, yellow, red, cyan, bold, dim] = ['32', '33', '31', '36', '1', '2'].map(tint);
const say = (s = '') => console.log(s);
const fail = (s) => { console.error(`\n  ${red('✗')} ${plain(s)}\n`); process.exit(1); };
// Renamed in 1.12.0 (5 Oct 2026, before the launch), the platform's old name out of every name a developer types:
// --wall, --allow-wall-hosts and the settings TOOLABY_WALL, TOOLABY_TOKEN_WALL, TOOLABY_LIVE_WALL and TOOLABY_TEST_WALL
// are --server, --allow-toolaby-hosts, TOOLABY_SERVER, TOOLABY_TOKEN_SERVER, TOOLABY_LIVE_SERVER and TOOLABY_TEST_SERVER.
// An old name is refused with its new one rather than ignored: ignored, a command meant for a server of its own would
// act on Test, a CI job's token would not reach the server it names, and a pack would refuse what it was told to allow.
for (const [was, now, used] of [
  ['--wall', '--server', argv.some((a) => a === '--wall' || a.startsWith('--wall='))],
  ['--allow-wall-hosts', '--allow-toolaby-hosts', argv.includes('--allow-wall-hosts')],
  ...['TOOLABY_WALL', 'TOOLABY_TOKEN_WALL', 'TOOLABY_LIVE_WALL', 'TOOLABY_TEST_WALL'].map((was) => [was, was.replace(/WALL$/, 'SERVER'), process.env[was] !== undefined]),
]) if (used) fail(`${was} is now ${now} (since 1.12.0). Use ${now} instead.`);

// ── The session: one per Toolaby server, in the user's config, readable by them alone ─────────────────────────────────────────
const CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'toolaby');
const CREDENTIALS = join(CONFIG_DIR, 'credentials.json');
// A newer toolaby, said after the command (lib/update.js): asked once a day, never in CI, never for --version or --help.
// The MCP server says it in the instructions its agent reads: its stdout carries JSON-RPC alone.
const newerToolaby = ['--version', '-v', '--help', '-h'].includes(command) ? async () => null : startUpdateCheck({ version: VERSION, configDir: CONFIG_DIR });
const readCredentials = () => { try { return JSON.parse(readFileSync(CREDENTIALS, 'utf8')); } catch { return {}; } };
function writeCredentials(all) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CREDENTIALS, JSON.stringify(all, null, 2) + '\n', { mode: 0o600 });
  try { chmodSync(CREDENTIALS, 0o600); } catch { /* not every filesystem has modes */ }
}
// TOOLABY_TOKEN goes to one Toolaby server, the one it was made for: the one TOOLABY_TOKEN_SERVER names, or — with none named —
// Live. A --server or a TOOLABY_SERVER, which a cloned project's settings can set, once received it wherever it pointed,
// and with no Toolaby server named it went to Test and Live alike, so a CI job's Live session reached Test too (25 Sep 2026).
// Refused there (401), it gives way to the session `toolaby login` stored for that Toolaby server, and is not sent again.
const tokenWall = address(process.env.TOOLABY_TOKEN_SERVER || WALLS.live);
let envRefused = false;
const envToken = () => (process.env.TOOLABY_TOKEN && !envRefused && tokenWall === wall ? process.env.TOOLABY_TOKEN : null);
const storedToken = () => envToken() || readCredentials()[wall]?.token || null;
/** Said where a session is missing and TOOLABY_TOKEN is set: it is kept for another Toolaby server, and a CI job should know. */
const envElsewhere = () => (process.env.TOOLABY_TOKEN && !envRefused && !envToken() ? `\n  TOOLABY_TOKEN is sent to ${tokenWall} alone; TOOLABY_TOKEN_SERVER=${wall} sends it here instead.` : '');

/** The most of one answer the command reads from a Toolaby server: none of Toolaby's comes near it (the largest, a wiring, is under 1 MB). */
const ANSWER_LIMIT = 4 * 1024 * 1024;
/** How long it waits for one, the whole of it: none of Toolaby's takes more than a few seconds. */
const ANSWER_TIME = 30_000;

async function api(path, { method = 'GET', body, token = storedToken(), base = wall, raw = null, headers: extra = {} } = {}) {
  // The time ran out (fetchHere's deadline; AbortError where an older Node says so): one line, whichever part was late.
  // A Toolaby server that answered a byte at a time held `login` and `wire` for ever (round 8, 25 Sep 2026).
  const late = (e) => (e?.name === 'TimeoutError' || e?.name === 'AbortError' ? new Error(`Toolaby at ${wall} did not answer ${path.split('?')[0]} within ${ANSWER_TIME / 1000} seconds.`) : null);
  // Only Toolaby answers for Toolaby: a redirect elsewhere — Live's /test is Test's — is refused (lib/safe.js).
  // `base`: the other side of this Toolaby, for Copy to Live; `raw`: a body sent as it is (a snapshot Test signed).
  const res = await fetchHere(`${base}${path}`, {
    ms: ANSWER_TIME,
    wall: base,
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': `toolaby-cli/${VERSION}`, ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  }).catch((e) => { throw late(e) ?? new Error(`Could not reach ${base}: ${e.message}`); });
  if (res.status === 401 && token && token === envToken()) {
    envRefused = true;
    const stored = storedToken();
    if (stored && stored !== token) { await res.body?.cancel().catch(() => {}); return api(path, { method, body, token: stored, base, raw, headers: extra }); }
  }
  // Read up to a few megabytes and no further: a Toolaby server at another address (--server, TOOLABY_SERVER) that answered without
  // end filled the command's memory, and the MCP server's, which hands what it reads to an agent (25 Sep 2026).
  // An answer cut short reads as no JSON, as it always has; only one past the limit, or the time, stops the command.
  const bytes = await readBounded(res, ANSWER_LIMIT).catch((e) => { const why = late(e); if (why) throw why; return Buffer.alloc(0); });
  if (!bytes) throw new Error(`Toolaby at ${wall} answered ${path.split('?')[0]} with more than ${ANSWER_LIMIT / 1024 / 1024} MB, which no answer of Toolaby's is. None of it was used.`);
  let json = {};
  try { json = JSON.parse(bytes.toString('utf8')); } catch { /* not JSON: the status says what happened */ }
  return { status: res.status, ok: res.ok, json };
}

// ── login: RFC 8628, the way GitHub's and Stripe's command lines sign in ─────────────────────────────────────────────
/** Opens the page, never through a shell (lib/safe.js); only a page signInPage() let through gets here. */
function openBrowser(url) {
  const [cmd, args] = opener(process.platform, url);
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* the URL is printed anyway */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const start = await api('/api/dev-auth/device/code', { method: 'POST', body: { client_id: CLIENT_ID }, token: null });
  if (!start.ok || !start.json.device_code) fail(`Toolaby at ${wall} did not start a sign-in (HTTP ${start.status}). Is the address right? --server names another.`);
  const { device_code, user_code, verification_uri, verification_uri_complete } = start.json;
  const link = verification_uri_complete || `${verification_uri}?user_code=${encodeURIComponent(user_code)}`;
  // Toolaby's own page, over https (http on this machine), or nothing opened and nothing signed in: an address
  // Toolaby hands over is opened on this computer, and a file: or another site's page opens whatever it names.
  const page = signInPage(link, wall);
  if (!page) fail(`Toolaby at ${wall} gave ${JSON.stringify(String(link).slice(0, 200))} as its sign-in page, which is not its own address over https.\n  It was not opened, and nothing was signed in.`);
  // How often it asks and for how long: what Toolaby said, a quarter of an hour at most (lib/safe.js).
  const { every: first, lasts } = devicePolling(start.json);
  out(`\n  Sign in to Toolaby (${side}) to continue.\n\n    Open   ${page}\n    Code   ${oneLine(user_code)}   (approve it there — it expires in ${Math.round(lasts / 60_000)} minutes)\n`);
  openBrowser(page);
  let every = first;
  const until = Date.now() + lasts;
  process.stdout.write('  Waiting for your approval');
  while (Date.now() < until) {
    // Never past the code's end: the last ask comes as it ends.
    await sleep(Math.min(every, until - Date.now()));
    process.stdout.write('.');
    const poll = await api('/api/dev-auth/device/token', { method: 'POST', body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code, client_id: CLIENT_ID }, token: null });
    if (poll.ok && poll.json.access_token) {
      const token = poll.json.access_token;
      const me = await api('/api/cli/me', { token });
      const email = me.ok ? me.json.email : null;
      const all = readCredentials();
      all[wall] = { token, email, at: new Date().toISOString() };
      writeCredentials(all);
      out(`\n\n  Signed in${email ? ` as ${oneLine(email)}` : ''} · ${side}.\n`);
      return token;
    }
    const why = poll.json.error;
    if (why === 'slow_down') every += 5000;
    else if (why === 'expired_token') fail(`The code expired before it was approved. Run \`npx -y toolaby@latest login${liveFlag}\` again.`);
    else if (why === 'access_denied') fail('The sign-in was denied in the browser. Nothing was signed in.');
    else if (why && why !== 'authorization_pending') fail(`Toolaby answered "${oneLine(why)}"${poll.json.error_description ? `: ${oneLine(poll.json.error_description)}` : ''}.`);
  }
  fail(`The code expired before it was approved. Run \`npx -y toolaby@latest login${liveFlag}\` again.`);
}

/** A token to act with: the stored one, else a sign-in right here — `wire` in a fresh terminal is one command, not two. */
async function tokenOrLogin() {
  const token = storedToken();
  if (!token && envElsewhere()) out(envElsewhere());
  return token ?? (await login());
}

async function whoami() {
  const token = storedToken();
  if (!token) fail(`Not signed in to ${side} (${wall}). Run \`npx -y toolaby@latest login${liveFlag}\`.${envElsewhere()}`);
  const me = await api('/api/cli/me', { token });
  if (me.status === 401) fail(`The session for ${wall} is no longer valid. Run \`npx -y toolaby@latest login${liveFlag}\`.`);
  if (!me.ok) fail(`Toolaby answered HTTP ${me.status}.`);
  out(`\n  ${oneLine(me.json.email)}  ·  ${side}  ·  ${wall}\n`);
  for (const w of me.json.workspaces) out(`    ${oneLine(w.name)}  (${oneLine(w.slug)}, ${oneLine(w.role)})  ${oneLine(w.site)}`);
  out();
}

async function logout() {
  const all = readCredentials();
  const entry = all[wall];
  if (!entry && !envToken()) { out(`\n  Not signed in to ${side} (${wall}).\n`); return; }
  // Revoked on the server first; forgotten here whatever the server said — but the difference is reported.
  const res = await api('/api/dev-auth/sign-out', { method: 'POST', body: {}, token: entry?.token ?? envToken() }).catch(() => ({ ok: false, status: 0 }));
  delete all[wall];
  writeCredentials(all);
  out(res.ok ? `\n  Signed out of ${side} (${wall}): the session was revoked and forgotten.\n` : `\n  The session was forgotten here, but Toolaby could not be reached to revoke it (HTTP ${res.status}); it expires on its own, or sign it out from the dashboard.\n`);
  if (envToken()) out('  TOOLABY_TOKEN is set in this shell and still authenticates.\n');
}

async function tools() {
  const token = await tokenOrLogin();
  const res = await api('/api/cli/tools', { token });
  if (res.status === 401) fail(`The session for ${side} is no longer valid. Run \`npx -y toolaby@latest login${liveFlag}\`.`);
  if (!res.ok) fail(`Toolaby answered HTTP ${res.status}.`);
  if (!res.json.tools.length) { out(`\n  No tools on ${side} yet. Make one in the dashboard, then \`npx -y toolaby@latest wire <tool-id>${liveFlag}\` in your extension's folder.\n`); return; }
  out(`\n  ${side}\n`);
  for (const t of res.json.tools) out(`    ${oneLine(t.slug).padEnd(40)} ${oneLine(t.name)}${t.bundle ? '  (bundle)' : ''}   ${oneLine(t.site)}`);
  out();
}

/**
 * Whether a build copies the folder Chrome loads from somewhere else, so Toolaby's files must be in what it copies: wired
 * --into a folder the build ships (buildRoot), a build folder that holds a manifest.json of its own, or a script or config
 * that copies manifest.json. A build that only bundles scripts into the folder with the manifest copies nothing.
 */
function buildCopiesFolder(buildRoot, dir) {
  if (buildRoot) return true;
  if (['dist', 'build', 'out', 'release', '.output'].some((d) => existsSync(join(dir, d, 'manifest.json')))) return true;
  const configs = [...listTree(dir, 0)].filter((p) => /^(vite|webpack|rollup|esbuild|build|tsup|parcel|gulpfile)[\w.-]*\.(m|c)?(js|ts|json)$/.test(p));
  const texts = [JSON.stringify(readJson(join(dir, 'package.json'))?.scripts ?? {}), ...configs.map((c) => readOr(join(dir, c), '').slice(0, 256 * 1024))];
  return texts.some((t) => /manifest\.json/.test(t) && /copy|\bcp\b|cpx|copyfiles|ncp|static-copy|outdir|outDir|dist/i.test(t));
}

/** Whether the build at `root` ships the folder `dir`: its scripts or a build config name it, or it is a folder bundlers copy whole. */
function shipsFolder(root, dir) {
  const rel = relative(root, dir).split(sep).join('/');
  if (/^(src\/)?(public|static|extension)$/.test(rel)) return true;
  const pkg = readJson(join(root, 'package.json')) ?? {};
  const configs = [...listTree(root, 0)].filter((p) => /^(vite|webpack|rollup|esbuild|build|tsup|parcel|gulpfile)[\w.-]*\.(m|c)?(js|ts|json)$/.test(p));
  const texts = [JSON.stringify(pkg.scripts ?? {}), ...configs.map((c) => readOr(join(root, c), '').slice(0, 256 * 1024))];
  const name = basename(dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = new RegExp(`(^|[\\s'"\`/(=,])${name}([\\s'"\`/),]|$)`);
  return texts.some((t) => t.includes(rel) || named.test(t));
}

// ── wire and create ─────────────────────────────────────────────────────────────────────────────────────────────────
const SKIP = new Set(['node_modules', '.git', '.output', 'dist', 'build', '.wxt', '.plasmo', '.next']);
function listTree(dir, depth, prefix = '', acc = new Set()) {
  for (const name of readdirSync(dir)) {
    const path = `${prefix}${name}`;
    acc.add(path);
    let isDir = false;
    try { isDir = statSync(join(dir, name)).isDirectory(); } catch { /* gone */ }
    if (isDir && depth > 0 && !SKIP.has(name)) listTree(join(dir, name), depth - 1, `${path}/`, acc);
  }
  return acc;
}
const readJson = (path) => { try { return JSON.parse(readText(path)); } catch { return null; } };
/** A project file's text, or `none` where it is no file to read (lib/safe.js readText): a link to a device reads as nothing. */
const readOr = (path, none = null) => { try { return readText(path); } catch { return none; } };
/** Whether a background already starts the platform, outside its comments: then it needs no lines added. */
const startsPlatform = (path) => { try { return startsWall(readText(path)); } catch { return false; } };
const isId = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,118}$/.test(s);
/** Whether anything is at the path, a link to nowhere included (existsSync follows a link, and says no for a dangling one). */
const there = (path) => { try { lstatSync(path); return true; } catch { return false; } };

/**
 * Where each path lands in `root`, every one settled before the first is written: inside the folder and through no
 * symbolic link (lib/safe.js), or a refusal and nothing written. What a manifest, a framework's config or Toolaby
 * names is theirs to say; where it is written is this command's. `named` says where a path came from, for the refusal.
 */
function placesIn(root, paths, named = {}) {
  const at = {}; const refused = [];
  for (const rel of new Set(paths)) {
    const r = inside(root, rel);
    if (r.why) refused.push(`${JSON.stringify(rel)}${named[rel] ? ` (${named[rel]})` : ''}: ${oneLine(r.why)}`);
    else at[rel] = r.path;
  }
  if (refused.length) fail(`Refused:\n\n${refused.map((r) => `    ${r}`).join('\n')}\n\n  This command writes only inside ${root}, and never through a symbolic link. Nothing was written.`);
  return at;
}

/** The tool's files from Toolaby, as the signed-in developer: a tool of theirs, or a clear no. */
async function filesFor(slug, scaffold, manifestKey = null, surfaces = null, agent = null) {
  const token = await tokenOrLogin();
  const q = new URLSearchParams(); if (scaffold) q.set('scaffold', '1'); if (manifestKey) q.set('manifestKey', manifestKey); if (surfaces) q.set('surfaces', surfaces);
  // What TOOLABY.md is written for (wiring/agents): the kind of project, an ExtensionPay move, the page known to be in front.
  if (agent?.kind) q.set('kind', agent.kind); if (agent?.extpay) q.set('extpay', '1'); if (agent?.front) q.set('front', agent.front);
  // The folder's manifest names another extension than the tool's: switched only when asked (--adopt-key).
  if (manifestKey && flag('--adopt-key')) q.set('adoptKey', '1');
  const res = await api(`/api/cli/wiring/${slug}${q.size ? `?${q}` : ''}`, { token });
  if (res.status === 401) { out('  The stored session is no longer valid; signing in again.'); await login(); return filesFor(slug, scaffold, manifestKey, surfaces, agent); }
  if (res.status === 409 && res.json?.error === 'identity_conflict') {
    const offered = oneLine(res.json.offered); const current = oneLine(res.json.current);
    fail(`This folder's manifest names the extension ${offered}; ${slug} is bound to ${current}. Nothing was written.\n\n  Run it again with --adopt-key to make ${offered} the tool's extension: its key then works from that one, and ${current}'s copies are named no more.\n  Or take the key out of this folder's manifest, and the tool's own goes in.`);
  }
  if (res.status === 404) {
    // Say who the command is: the tool may well exist — in a workspace of another account of theirs.
    const me = await api('/api/cli/me', { token }).catch(() => null);
    const who = me?.ok ? `\n\n  You are signed in as ${oneLine(me.json.email)}${me.json.workspaces.length ? ` (workspaces: ${me.json.workspaces.map((w) => oneLine(w.slug)).join(', ')})` : ' (no workspace yet)'}.\n  Another account owns it? \`npx -y toolaby@latest logout${liveFlag}\`, sign in to the dashboard as that account, then run this again.` : '';
    fail(`${oneLine(res.json.message ?? `No tool "${slug}" in your workspaces.`)}${who}`);
  }
  if (!res.ok) fail(oneLine(res.json.message ?? `Toolaby answered HTTP ${res.status}.`));
  return res.json;
}

/**
 * ExtensionPay's plans, made on the tool: read from ExtensionPay's public list for the extension — the one its own
 * getPlans() reads — and each made as the dashboard's New plan makes one, its ExtensionPay nickname as its tier, which
 * is what ExtPay's openPaymentPage('pro') finds it by. A plan the tool already has by that name is left. On Live nothing
 * is made: plans go there from Test, with Copy to Live.
 */
async function copyExtPayPlans(slug, id) {
  const got = await fetchBounded(extPayPlansUrl(id), { ms: 15_000 }).catch((e) => ({ why: e.name === 'TimeoutError' ? 'it took longer than 15 seconds' : oneLine(e.message) }));
  if (got.why || !got.ok || !got.body) return { error: `ExtensionPay's plans for ${id} could not be read (${got.why ?? (got.body ? `it answered ${got.status}` : 'it sent more than a megabyte')})`, made: [], had: [], skipped: [], failed: [] };
  let list = null;
  try { list = JSON.parse(got.body.toString('utf8')); } catch { /* said below */ }
  if (!Array.isArray(list)) return { error: `ExtensionPay's plans for ${id} were not a list`, made: [], had: [], skipped: [], failed: [] };
  const { make, skipped } = plansFromExtPay(list);
  if (live) return { live: true, made: [], had: [], skipped, failed: [] };
  const tool = await api(`/api/cli/tools/${slug}`);
  const names = new Set((tool.json?.plans ?? []).flatMap((p) => [p.tier, p.name]).filter(Boolean).map((n) => String(n).toLowerCase()));
  const made = [], had = [], failed = [], differs = [];
  for (const p of make) {
    // A plan with a nickname is the tool's when a tier or a name says it; one without, when the tool already sells it.
    if (p.name ? names.has(p.name.toLowerCase()) : (tool.json?.plans ?? []).some((q) => q.billing === p.billing && q.amount === p.amount && q.currency === p.currency && (p.billing === 'one_time' || q.interval === p.interval))) {
      had.push(p);
      // Made by hand before, at another price than ExtensionPay's: said, since new buyers would pay it (2 Oct 2026).
      const q = p.name ? (tool.json?.plans ?? []).find((x) => [x.tier, x.name, x.id].some((n) => String(n ?? '').toLowerCase() === p.name.toLowerCase())) : null;
      if (q && typeof q.amount === 'number' && (q.billing !== p.billing || Number(q.amount) !== Number(p.amount) || String(q.currency).toLowerCase() !== String(p.currency).toLowerCase() || (p.billing === 'subscription' && q.interval !== p.interval))) {
        differs.push({ name: p.name, here: { billing: q.billing, interval: q.interval ?? 'month', amount: Number(q.amount), currency: String(q.currency) }, there: p });
      }
      continue;
    }
    // ExtensionPay sold to one person, on any number of their browsers: no seats, and the most devices a plan holds.
    const res = await api(`/api/cli/tools/${slug}/plans`, { method: 'POST', body: { ...p, perSeat: false, ...(p.billing === 'one_time' ? { devices: 10 } : {}) } });
    if (res.ok && res.json?.ok !== false) made.push({ ...p, id: res.json?.plan?.id }); else failed.push({ ...p, why: oneLine(res.json?.message ?? `it answered ${res.status}`) });
  }
  return { made, had, skipped, failed, differs };
}

async function wire() {
  const slug = positional[0];
  if (!isId(slug)) fail(command === 'upgrade' ? 'usage: npx -y toolaby@latest upgrade <tool-id> [--into <folder>]   — `npx -y toolaby@latest tools` lists your ids' : 'usage: npx -y toolaby@latest wire <tool-id> [--into <folder>] [--force] [--adopt-key] [--from-extensionpay]   — `npx -y toolaby@latest tools` lists your ids');
  const dir = resolve(opt('--into') ?? '.');
  if (!existsSync(dir)) fail(`${dir} does not exist`);
  const tree = listTree(dir, 3);
  // In the folder as Chrome finds it, deeper than the listing reads — but not in a build's folder (dist/, build/…), which
  // the listing leaves out on purpose: what is there a build may make again, and wipe what the wiring wrote beside it.
  const onDisk = (p) => { const rel = String(p).replace(/^(\.\/)+/, '').replace(/\/$/, ''); return !!rel && !rel.startsWith('/') && !rel.split('/').includes('..') && existsSync(join(dir, rel)); };
  const has = (p) => tree.has(String(p).replace(/^(\.\/)+/, '').replace(/\/$/, '')) || (!String(p).split('/').some((seg) => SKIP.has(seg)) && onDisk(p));
  // Read as Chrome reads it: comments and a trailing comma are fine there. Written back, it is plain JSON (said below).
  const read = has('manifest.json') ? parseManifest(readOr(join(dir, 'manifest.json'), '')) : null;
  const manifest = read?.manifest ?? null;
  if (read && !manifest) fail(`manifest.json could not be read: ${oneLine(read.error ?? 'it is not JSON')}. Fix it, then wire again. Nothing was written.`);
  // A Manifest V2 extension was wired as if it were V3 — its background page swapped for a service worker Chrome then
  // refused to load (1 Oct 2026). Chrome runs V3 alone: said, and nothing written.
  if (manifest && notManifestV3(manifest)) fail(`${notManifestV3(manifest)}\n  Nothing was written.`);
  const configSource = ['manifest.config.ts', 'manifest.config.js', 'manifest.ts', 'src/manifest.ts'].find(has);
  const detecting = { has, packageJson: has('package.json') ? readJson(join(dir, 'package.json')) : null, manifest, manifestSource: configSource ? readOr(join(dir, configSource)) : null, tree };
  // Before anything is asked of Toolaby: the first wiring binds the tool to an extension's identity, and a folder that
  // was not the extension bound it to none of the developer's — wired again where it said, the folder's own key was
  // refused (shareprompts, wired from the wild, 1 Oct 2026).
  let agent = null;
  {
    const project = detectProject({ ...detecting, site: wall, manifestKey: null });
    // Nothing recognised: nothing is written and nothing guessed. A manifest below the top is where to point --into — unless a
    // build makes the background it names (Vite's public/), where the wiring's background would stand in its way; otherwise
    // the Set up page's Wire it by hand has the files and the three things to paste.
    // Each manifest below, when there are several: the shallowest is not always the one the build ships — werkzeugbox's
    // build copies src/static/, beside an older originals/ (1 Oct 2026).
    const others = [...tree].filter((p) => p.endsWith('/manifest.json') && !p.includes('node_modules/') && p !== project.foundManifest).sort((a, b) => a.split('/').length - b.split('/').length).slice(0, 3);
    if (project.kind === 'unknown') fail(`${dir} has no manifest.json at the top and is not a WXT, CRXJS or Plasmo project${project.foundManifest ? ` — there is one at ${oneLine(project.foundManifest)}: run this with --into ${oneLine(dirname(project.foundManifest)) || '.'}, unless your build makes the background it names (then wire it by hand)${others.length ? `. There ${others.length === 1 ? 'is another' : 'are others'} at ${others.map(oneLine).join(', ')}: wire the one your build ships` : ''}` : ''}.\n  Nothing was written. For a layout of your own, the tool's Set up page → Wire it by hand has the files and the three things to paste.`);
    // What TOOLABY.md is written for: a plain manifest that a build ships (its own, or the project's above the folder, as
    // below) is `bundled`; an ExtensionPay move, asked now or made before; your page in front, when asked for.
    const above = () => { for (let up = dirname(dir), i = 0; i < 3 && up !== dirname(up); up = dirname(up), i++) if (existsSync(join(up, 'package.json'))) return !!readJson(join(up, 'package.json'))?.scripts?.build; return false; };
    agent = { kind: project.kind === 'plain' && (project.built || (!has('package.json') && above())) ? 'bundled' : project.kind, extpay: flag('--from-extensionpay') || has('toolaby-extpay.js'), front: flag('--own-popup') ? 'own' : flag('--toolaby-popup') ? 'toolaby' : null };
  }
  // A key the manifest already has is the identity the platform adopts; otherwise the platform's goes in.
  const plan = await filesFor(slug, false, typeof manifest?.key === 'string' ? manifest.key : null, null, agent);
  const site = plan.site;
  const manifestKey = plan.identity?.manifestKey ?? null;
  Object.assign(detecting, { site, manifestKey });
  let project = detectProject(detecting);
  // Pointed --into a folder a build ships (src/static under webpack, public/ under Vite), the project and its build are
  // above it: the nearest package.json, a few folders up. With a build, what the manifest names and the folder lacks is
  // the build's to make, and nothing is written at its name, where it would have stood in the build's way (two webpack
  // extensions wired from the wild, 1 Oct 2026).
  // Only a build that ships this folder: one whose scripts or config name it, or a folder a bundler copies as it is
  // (public/, static/). An extension's folder inside a monorepo was taken for the output of the monorepo's own build, and
  // the whole repository's code read as the extension's (2 Oct 2026).
  let buildRoot = null;
  if (project.kind === 'plain' && !project.built && !has('package.json')) {
    for (let up = dirname(dir), i = 0; i < 3 && up !== dirname(up); up = dirname(up), i++) {
      if (!existsSync(join(up, 'package.json'))) continue;
      if (readJson(join(up, 'package.json'))?.scripts?.build && shipsFolder(up, dir)) { project.built = true; buildRoot = up; }
      break;
    }
  }

  // The extension's own popup and side panel: the manifest's, or — wired before — what the existing configuration remembers.
  const configPath = join(dir, `${project.codeDir}toolaby.config.js`);
  const oldConfig = existsSync(configPath) ? readOr(configPath, '') : '';
  const remembered = oldConfig.match(/appPopup:\s*'([^']*)'/)?.[1] || null;
  const rememberedSidePanel = oldConfig.match(/appSidePanel:\s*'([^']*)'/)?.[1] || null;
  // The extension's own code, read first: a popup it handles itself (setPopup, getPopup) decides which page stands in
  // front, and whether it opens the paywall anywhere decides whether the lines for it are a step.
  // In a folder a build ships, the code is the project's, above it: where the source imports ExtPay and opens the paywall
  // (src/, beside src/static/), with its paths from the project's top.
  const codeRoot = buildRoot ?? dir;
  const codeTree = buildRoot ? listTree(buildRoot, 5) : new Set(tree);
  // A dist/ or build/ the manifest names the extension's own files in is its code too, for ExtPay: boyonglin's background
  // and its ExtPay are its own source there, which its build leaves alone (1 Oct 2026). Read by their paths from where the
  // code is read.
  const named = [workerIn(manifest), ...(Array.isArray(manifest?.content_scripts) ? manifest.content_scripts.flatMap((c) => (Array.isArray(c?.js) ? c.js : [])) : [])];
  const ownDirs = [...new Set(named.filter((f) => typeof f === 'string' && onDisk(f)).map((f) => f.replace(/^(\.\/)+/, '').split('/')[0]).filter((top) => SKIP.has(top) && top !== 'node_modules'))]
    .map((top) => `${relative(codeRoot, join(dir, top)).split(sep).join('/')}/`);
  for (const prefix of ownDirs) listTree(join(codeRoot, prefix), 4, prefix, codeTree);
  const ownHere = (p) => ownCode(p) || (ownDirs.some((d) => p.startsWith(d)) && /\.(m?js|jsx|ts|tsx)$/.test(p) && !/(^|\/)toolaby[^/]*$/.test(p) && !/(^|\/)node_modules\//.test(p));
  const readOwn = (path) => { let text = ''; try { if (statSync(join(codeRoot, path)).size < 512_000) text = readOr(join(codeRoot, path), ''); } catch { /* gone */ } return { path, text }; };
  // The shallowest first, where an extension's own pages and background are: CodeWall's 503 scripts, read in the folder's
  // order to the first 400, left its popup.js unread (1 Oct 2026).
  const ownFiles = [...codeTree].filter(ownHere).sort((a, b) => a.split('/').length - b.split('/').length).slice(0, 2000);
  const code = project.manifestFile ? ownFiles.map(readOwn) : [];
  const popupSwap = popupSwapIn(code);
  // Wired for the first time, an extension whose code handles its popup keeps it in front: Toolaby's in front of it is
  // skipped by setPopup(), and found by getPopup() where the code expects its own (Chrome's action sample threw so).
  const keptForSwap = !oldConfig && !!popupSwap && typeof manifest?.action?.default_popup === 'string' && !flag('--own-popup');
  // ExtensionPay, where the extension uses it: its calls kept, answered by Toolaby, its content script and host on
  // extensionpay.com taken out of the manifest (lib/extpay.js, docs/extensionpay).
  // A bundle with ExtensionPay inside can run to megabytes (fairsky's, 14 MB), past what is read above and past what
  // readText reads by default: read whole when it names extensionpay.com, so the switch can say it is a build's.
  let wholeRead = 0;
  const whole = (f) => {
    if (f.text || wholeRead > 256_000_000) return f;
    try { const text = readText(join(codeRoot, f.path), 64_000_000); wholeRead += text.length; if (text.includes('extensionpay.com')) return { path: f.path, text }; } catch { /* gone, or larger still */ }
    return f;
  };
  const codeDirFromRoot = buildRoot ? `${relative(buildRoot, dir).split(sep).join('/')}/${project.codeDir}` : project.codeDir;
  const ownSources = code.length ? code : ownFiles.map(readOwn);
  const extpay = switchExtPay(ownSources.map(whole), { codeDir: codeDirFromRoot, classic: typeof plan.files['toolaby-extpay.js'] === 'string' ? plan.files['toolaby-extpay.js'] : null });
  // ExtensionPay is moved only when asked by name: the move rewrites the extension's payments, and one moved by mistake
  // and published locks out the buyers who paid through ExtensionPay. Found and not asked for: said, and nothing written.
  // Toolaby's ExtPay from an earlier move is the platform's own file, and is written again as the others are.
  const moving = flag('--from-extensionpay');
  if (extpay?.found && !moving) fail(extPayNotAsked(extpay, 'run this again with --from-extensionpay'));
  const extEdits = (extpay?.edits ?? []).filter((e) => moving || e.why === 'refresh');
  // Whether an open of the Toolaby popup is a free use: not where the code counts its own with toolaby.gate() — written
  // to toolaby.config.js as countOpens, read again from the code at every wiring and upgrade (3 Oct 2026). Never where the
  // extension sells through ExtPay's calls, which say what is paid: counted there, the opens shut free users out after as
  // many as the Free plan's number, with nothing paid asked for (7 Oct 2026).
  // Known by its calls (ExtPay('…') in the code), not by the library: after the move the library is Toolaby's, and an
  // upgrade that took it for an extension of no ExtPay counted the opens again.
  const sellsThroughExtPay = !!(extpay?.found || extpay?.ids.length || extpay?.moved.length) || has('toolaby-extpay.js');
  const countOpens = !sellsThroughExtPay && !countsUses(ownSources);
  // Whether Toolaby sets the page Chrome opens once the extension is removed: not where the code sets its own (summary
  // setsUninstallPage), written to toolaby.config.js as uninstallPage and read again at every wiring and upgrade.
  const uninstallPage = !setsUninstallPage(ownSources);
  // An extension whose own pages draw the panel — what `create` makes, "your popup first", or asked with --own-popup —
  // keeps them in front.
  // Asked for the Toolaby popup in front (--toolaby-popup): an extension whose page was in front — what `create` makes,
  // or --own-popup asked before — gets it, with its own page behind (3 Oct 2026). Never over code that sets its popup
  // itself, which would skip it.
  if (flag('--toolaby-popup') && flag('--own-popup')) fail('--toolaby-popup and --own-popup ask for opposite pages in front: choose one.');
  if (flag('--toolaby-popup') && popupSwap) fail(`Your code handles the popup itself (${oneLine(popupSwap.call)} in ${oneLine(popupSwap.file)}): the Toolaby popup in front of it would be skipped. Keep your popup in front and gate each paid action in code. Nothing was written.`);
  // Moved for the first time, an ExtensionPay extension has its own "Pay now" page in front of everything. Which paywall
  // people meet first is the developer's to say, asked once (7 Oct 2026): Toolaby's — its sign-in and plans when the
  // dashboard says the person may not use the extension yet, then the extension's own popup — or theirs, as it was. Its
  // code is not touched either way, and `upgrade --own-popup` or `--toolaby-popup` changes it later. Wired before, an
  // extension keeps what it has: nothing is asked again.
  const extPayFirst = !oldConfig && moving && !!extpay?.found && !popupSwap;
  const toolabyFront = flag('--toolaby-popup') || (extPayFirst && !flag('--own-popup') && await paywallInFront(slug));
  const keptForExtPay = extPayFirst && !toolabyFront;
  const ownInFront = !toolabyFront && (flag('--own-popup') || drawsItself(manifest, oldConfig) || keptForSwap || keptForExtPay);
  // A framework's pages in front are its configuration's and the snippets': asked again, with the extension's own kept there.
  if (ownInFront && !project.manifestFile && project.wrapper) project = { ...detectProject({ ...detecting, ownInFront: true }), built: project.built };
  // The background the manifest names, read from inside the folder only: whether it starts Toolaby, or is Toolaby's.
  const namedWorker = workerIn(manifest) ?? '';
  const workerSource = namedWorker && has(namedWorker) && !inside(dir, namedWorker).why ? readOr(join(dir, namedWorker), '') : null;
  const wiring = project.manifestFile && manifest ? wireManifest(manifest, { site, apex: new URL(wall).host, has, remembered, rememberedSidePanel, manifestKey, ownInFront, workerSource, built: project.built }) : null;
  let extpayManifest = false;
  if (moving && extpay?.found && wiring) { const w = withoutExtPay(wiring.manifest); if (w.changed) { wiring.manifest = w.manifest; wiring.changed = true; extpayManifest = true; } }
  const appPopup = wiring ? wiring.appPopup : project.wrapper ? (project.appPopup ?? remembered) : null;
  const appSidePanel = wiring ? wiring.appSidePanel : project.wrapper ? (project.appSidePanel ?? rememberedSidePanel) : null;
  // Toolaby's line at the foot of the extension's own popup and side panel, whichever stands in front (wiring/project
  // withAccountBar): written into a plain extension's pages, written again between its markers at every upgrade, and
  // taken out where toolaby.config.js says accountBar: false. A wired popup had none (7 Oct 2026).
  const keepBar = accountBarIn(oldConfig);
  const barPages = accountBarPages(project.kind, [wiring?.ownPopup, wiring?.ownSidePanel], has).flatMap((page) => {
    const r = inside(dir, page);
    if (r.why || !there(r.path)) return [];
    const before = readOr(r.path, '');
    const after = withAccountBar(before, { keep: keepBar, codeDir: project.codeDir });
    return [{ page, state: after.state, text: after.html, changed: after.html !== before }];
  });
  const barEdits = barPages.filter((b) => b.changed);
  // Toolaby's files, in the folder that ships. What coding agents read goes to the project's root instead (below).
  const agentPaths = new Set(AGENT_FILES.map((f) => f.path));
  const targets = filesToWrite(project, appPopup, appSidePanel, { popup: !!(wiring?.ownPopup ?? project.ownPopup), sidePanel: !!(wiring?.ownSidePanel ?? project.ownSidePanel) }).filter((p) => !agentPaths.has(p));
  // What coding agents read, at the project's root — the build's, above a folder it copies — never in the folder that
  // ships (wiring/project agentWrites): the guide, the skills in both places, and AGENTS.md and CLAUDE.md, Toolaby's own
  // where the project has none, and where it has its own, Toolaby's block refreshed between its markers and nothing else.
  // Nothing is written through a link (placesIn): an AGENTS.md or CLAUDE.md that is one, as when one names the other, is
  // left as it is, and said; any other link on the way refuses the wiring before anything is written.
  const agentRoot = buildRoot ?? dir;
  const linkedHere = (f) => { try { return lstatSync(join(agentRoot, f)).isSymbolicLink(); } catch { return false; } };
  const agentLeft = ['AGENTS.md', 'CLAUDE.md'].filter(linkedHere);
  const ownAgentFile = (f) => (there(join(agentRoot, f)) ? readOr(join(agentRoot, f), '') : null);
  const agentFiles = agentWrites(plan.files, { agents: ownAgentFile('AGENTS.md'), claude: ownAgentFile('CLAUDE.md') }, typeof plan.agentBlock === 'string' ? plan.agentBlock : null).filter((f) => !agentLeft.includes(f.path));
  const agentAt = placesIn(agentRoot, agentFiles.map((f) => f.path));
  // An earlier wiring put the guide and the skill in the folder that ships: with them at the root now, those copies go.
  const strayAgents = agentRoot === dir ? [] : [...agentPaths].filter((p) => { const r = inside(dir, p); if (r.why || !there(r.path)) return false; const t = readOr(r.path, ''); return t.startsWith('# Selling this extension with Toolaby') || t.startsWith('---\nname: toolaby\n'); });
  // What an earlier wiring wrote and this one does not, wherever it put them: taken away, so nothing stale is shipped.
  const stale = [...new Set([project.codeDir, project.popupDir, 'public/', 'src/public/'])].flatMap((under) => STALE_FILES.map((f) => `${under}${f}`)).filter((p) => existsSync(join(dir, p)));
  // The background a manifest names and that is not there is written — at the name the manifest gives, which is the repository's to choose.
  const worker = wiring ? (wiring.background.kind === 'new' ? wiring.background.file : null) : project.createWorker?.file ?? null;
  // The extension's own background, with Toolaby's in front of it — and, for a classic one, the client as a script.
  const wrap = wiring?.background.kind === 'wrap' ? wiring.background : null;
  const classicClient = wrap?.classic ? `${project.codeDir}${CLASSIC_CLIENT}` : null;
  const at = placesIn(dir, [...targets, ...strayAgents, ...stale, ...(worker ? [worker] : []), ...(wrap ? [wrap.file] : []), ...(classicClient ? [classicClient] : []), ...(buildRoot ? [] : extEdits.map((e) => e.path)), ...barEdits.map((b) => b.page), ...(wiring?.changed ? ['manifest.json'] : [])], { ...(worker ? { [worker]: 'the background the manifest names' } : {}), ...(wrap ? { [wrap.file]: "Toolaby's background, beside yours" } : {}) });
  // A file of the developer's own where Toolaby's background goes is never replaced: only one Toolaby wrote.
  if (wrap && wrap.file !== namedWorker && there(at[wrap.file]) && !wrappedBy(readOr(at[wrap.file], ''))) fail(`${wrap.file} is already in ${dir}, and it is not Toolaby's. Rename it, then run this again. Nothing was written.`);
  // Taken for missing, it may only be out of the listing's sight — spelt "./background.js", in dist/, or deeper down:
  // the developer's own background is never replaced by two lines of ours.
  if (worker && there(at[worker])) fail(`${JSON.stringify(worker)}, the background the manifest names, is already in ${dir}; it would have been replaced. Nothing was written.\n  Name it in the manifest as the folder spells it — or, if a build writes it, run this with --into the folder whose manifest.json names it.`);
  const present = targets.filter((f) => existsSync(join(dir, f)));
  if (present.length && !flag('--force')) fail(`${present.join(', ')} already in ${dir}; add --force to replace them.`);
  const write = (rel, content) => { mkdirSync(dirname(at[rel]), { recursive: true }); writeFileSync(at[rel], content); };
  // A command older than Toolaby asks for files Toolaby no longer hands out: said, with the way to the current one, rather than a crash.
  // The agent files come from Walls that write them; one that does not is older, not newer, than this command.
  const missing = [...targets, ...(classicClient ? [classicClient] : [])].filter((p) => !agentPaths.has(p)).map((p) => p.split('/').pop()).filter((name) => typeof plan.files[name] !== 'string');
  if (missing.length) fail(`This command (${VERSION}) is older than Toolaby at ${wall}: it expects ${missing.join(', ')}, which Toolaby no longer hands out.\n  Update it: npm install -g toolaby@latest — or run Toolaby's own copy: npx --yes ${wall}/toolaby.tgz ${command} ${slug}${liveFlag}`);
  const wrote = targets.filter((path) => typeof plan.files[path.split('/').pop()] === 'string');
  for (const path of wrote) write(path, fillPages(plan.files[path.split('/').pop()], { appPopup, appSidePanel, countOpens, uninstallPage, accountBar: keepBar }));
  for (const f of agentFiles) { mkdirSync(dirname(agentAt[f.path]), { recursive: true }); writeFileSync(agentAt[f.path], f.content); }
  for (const p of strayAgents) unlinkSync(at[p]);
  // A Toolaby older than the block sends none: then the project's own AGENTS.md is said, as before.
  const ownAgents = typeof plan.agentBlock !== 'string' && there(join(agentRoot, 'AGENTS.md')) && !readOr(join(agentRoot, 'AGENTS.md'), '').includes('TOOLABY.md');
  for (const p of stale) unlinkSync(at[p]);
  if (wiring) {
    if (wiring.background.kind === 'new') write(wiring.background.file, WORKER_LINES);
    // Toolaby's background in front of theirs, with what toolaby.config.js starts Toolaby with (a classic one carries it).
    if (wrap) write(wrap.file, wallWorkerSource(wrap, wrap.classic ? configValues(fillPages(plan.files['toolaby.config.js'], { appPopup, appSidePanel, countOpens, uninstallPage, accountBar: keepBar })) : null));
    if (classicClient) write(classicClient, plan.files[CLASSIC_CLIENT]);
    if (wiring.changed) write('manifest.json', JSON.stringify(wiring.manifest, null, 2) + '\n');
  } else if (project.createWorker) {
    write(project.createWorker.file, project.createWorker.content);
  }
  for (const b of barEdits) write(b.page, b.text);
  // The switch's edits, where the code is: the folder, or the project above it.
  const editAt = buildRoot ? placesIn(buildRoot, extEdits.map((e) => e.path)) : at;
  for (const e of extEdits) { mkdirSync(dirname(editAt[e.path]), { recursive: true }); writeFileSync(editAt[e.path], e.text); }
  const plansMoved = moving && extpay?.found && extpay.ids.length ? await copyExtPayPlans(slug, extpay.ids[0]) : null;
  // A subscription plan the move made changes the tool key (it carries the kind of plan sold), and the files above were
  // written with the one before: they get the current one, so the first `check` does not find a key out of date.
  if (plansMoved?.made?.length) {
    const oldKey = /key:\s*'([^']+)'/.exec(plan.files['toolaby.config.js'] ?? '')?.[1];
    const now = await api(`/api/cli/tools/${slug}`).catch(() => null);
    const newKey = now?.ok ? now.json?.toolKey : null;
    if (oldKey && newKey && newKey !== oldKey) {
      for (const rel of [...wrote, ...(wrap ? [wrap.file] : [])]) {
        const file = at[rel];
        if (!file || !existsSync(file)) continue;
        const text = readFileSync(file, 'utf8');
        if (text.includes(oldKey)) writeFileSync(file, text.split(oldKey).join(newKey));
      }
    }
  }
  // Whether the code opens the paywall: unknown, so not asked for, where ExtPay's calls are in a build and not here.
  const summary = wiringSummary({ project, wiring, appPopup, appSidePanel, workerStarts: !!project.worker && startsPlatform(join(dir, project.worker)), popupSwap, keptForSwap, keptForExtPay, extPayFront: sellsThroughExtPay && !!(appPopup || appSidePanel), accountBar: barPages.map(({ page, state }) => ({ page, state })), gates: project.manifestFile ? gatesIn(code) || !!extpay?.built.length : null, buildCopies: project.built ? buildCopiesFolder(buildRoot, dir) : null });

  if (extpay && (moving || extEdits.length)) {
    const pkg = existsSync(join(codeRoot, 'package.json')) ? readJson(join(codeRoot, 'package.json')) : null;
    summary.rows.push(...extPayRows({ ...extpay, edits: extEdits }, { slug, manifestChanged: extpayManifest, ownManifest: !!wiring, plans: plansMoved, usesNpm: !!(pkg?.dependencies?.extpay || pkg?.devDependencies?.extpay) }));
  }
  if (moving && !extpay?.found) summary.rows.push({ tone: 'warn', label: 'ExtensionPay', text: 'None here to move: wired as any extension is.' });
  // A build that writes the manifest's externally_connectable or security policy itself puts back what it had, and
  // Toolaby's address with them is gone from what ships: every call failed to fetch in grt-bus-time's (1 Oct 2026). Said,
  // with how to see what the built manifest lacks. Its host permissions no longer matter: Toolaby needs none.
  if (wiring && project.built) {
    const configs = [...(buildRoot ? listTree(buildRoot, 0) : tree)].filter((p) => /^(vite|webpack|rollup|esbuild|build)[\w.-]*\.(m|c)?(js|ts)$/.test(p));
    const rewrites = configs.filter((p) => /\b(externally_connectable|content_security_policy)\b/.test(readOr(join(codeRoot, p), '')));
    if (rewrites.length) summary.rows.push({ tone: 'warn', label: 'Build', text: `${rewrites.join(', ')} writes the manifest's externally_connectable or content security policy itself: add ${new URL(site).origin} there too. \`npx -y toolaby@latest check <your build's folder>\` says what a built manifest lacks.` });
  }
  // Wired again, a folder takes `upgrade` (wire, replacing the platform's files): the command, ready to paste.
  const into = opt('--into');
  const again = `npx -y toolaby@latest upgrade ${slug}${liveFlag}${into ? ` --into ${/^[\w@%+=:,./-]+$/.test(into) ? into : `'${into.replace(/'/g, "'\\''")}'`}` : ''}`;
  say(`\n  ${summary.todo ? `${yellow('!')} ${bold('Almost wired')}` : `${green('✓')} ${bold('Wired')}`}  ${plain(oneLine(plan.name))} → ${plain(basename(dir))}  ${dim(`· ${side}${project.kind === 'plain' ? '' : ` · ${project.label}`}`)}\n`);
  const width = Math.max(...summary.rows.map((r) => r.label.length));
  for (const r of summary.rows) {
    const mark = r.tone === 'ok' ? green('✓') : r.tone === 'warn' ? yellow('!') : cyan('→');
    say(`    ${mark} ${bold(r.label.padEnd(width))}  ${plain(oneLine(r.text))}`);
    if (r.fix === 'own-popup') say(`      ${' '.repeat(width)}  ${cyan(`${again} --own-popup`)}`);
    if (r.code) say(`\n${r.code.split('\n').map((l) => `        ${cyan(l)}`).join('\n')}\n`);
  }
  if (ownAgents) say(`    ${dim('Your AGENTS.md is your own: add "Before changing anything paid, read TOOLABY.md."')}`);
  if (agentRoot !== dir) say(`    ${dim(`For coding agents: TOOLABY.md and the skills are at the project's root, ${agentRoot}${strayAgents.length ? `; moved there from ${strayAgents.join(', ')}` : ''}.`)}`);
  // Read now, by an agent that ran this: the skills it just wrote load at its next session, the guide at once.
  say(`    ${dim(`A coding agent reads ${relative(process.cwd(), join(agentRoot, 'TOOLABY.md')) || 'TOOLABY.md'} now: how this extension sells, checks and ships. Its MCP server, once per machine: npx -y toolaby@latest agents${liveFlag}`)}`);
  if (agentLeft.length) say(`    ${dim(`${agentLeft.join(' and ')}: a link, left as it is. Point it at TOOLABY.md yourself.`)}`);
  if (read?.comments && wiring?.changed) say(`    ${dim('manifest.json had comments: it is written back as plain JSON, without them.')}`);
  if (stale.length) say(`    ${dim(`Removed: ${stale.join(', ')} (now inside toolaby.js)`)}`);
  say(`\n  ${bold('Next')}  ${summary.rows.some((r) => r.again) ? `${plain(summary.next.replace(/wire again\.$/, 'run'))} ${cyan(again)}` : plain(summary.next)}\n`);
  // "Almost wired" leaves steps for a person: 2, so a script or an agent knows the folder is not done; 0 when it is.
  if (summary.todo) process.exitCode = 2;
}

async function create() {
  const slug = positional[0];
  if (!isId(slug)) fail('usage: npx -y toolaby@latest create <tool-id> [--dir <folder>]   — `npx -y toolaby@latest tools` lists your ids');
  const dir = resolve(opt('--dir') ?? slug);
  if (there(dir)) fail(`${dir} already exists`);
  // Which surfaces this extension is made with, asked first: the files for coding agents name only what is written.
  const asked = opt('--surfaces');
  if (asked && !SURFACES.includes(asked)) fail(`--surfaces takes ${SURFACES.join(', ')} — not "${asked}".`);
  const surfaces = surfacesOf(asked);
  // A plain extension whose own pages draw the panel: TOOLABY.md is written for that.
  const plan = await filesFor(slug, true, null, surfaces, { kind: 'plain', front: 'own' });
  // The scaffold's own files as Toolaby names them (older Walls did not, hence the list), and only names this command
  // knows (lib/safe.js): Toolaby's list says which files a new extension has, never where they go. A name joined to
  // the folder as it came let a Toolaby server at another address — --server, TOOLABY_SERVER — write any file, anywhere.
  const scaffold = Array.isArray(plan.scaffold) && plan.scaffold.length ? plan.scaffold : SCAFFOLD_FILES;
  const unknown = scaffold.filter((f) => !SCAFFOLD_FILES.includes(f));
  if (unknown.length) fail(`Toolaby at ${wall} named ${unknown.map((f) => JSON.stringify(f)).join(', ')} among a new extension's files: not ${unknown.length > 1 ? 'files' : 'a file'} this command (${VERSION}) writes.\n  Nothing was written. If Toolaby is newer than this command, update it: npm install -g toolaby@latest`);
  // Both surfaces (the default), one of them, or none at all for a tool that works from the background — and beside each,
  // Toolaby's page for it, which toolaby.showPaywall() opens when an action is refused (the extension's own pages stay in front).
  const wanted = [...CODE_FILES, ...scaffoldFilesFor(surfaces, scaffold), ...(hasPopup(surfaces) ? POPUP_FILES : []), ...(hasSidePanel(surfaces) ? SIDE_PANEL_FILES : [])];
  const absent = wanted.filter((f) => typeof plan.files[f] !== 'string');
  if (absent.length) fail(`Toolaby at ${wall} named ${absent.join(', ')} for a new extension but did not hand ${absent.length > 1 ? 'them' : 'it'} over.\n  Nothing was written. Update this command: npm install -g toolaby@latest — or run Toolaby's own copy: npx --yes ${wall}/toolaby.tgz create ${slug}${liveFlag}`);
  // What a coding agent reads (wiring/project agentWrites): the guide with this tool's features and plans, the skills in
  // both places agents look, AGENTS.md and CLAUDE.md.
  const agentFiles = agentWrites(plan.files, { agents: null, claude: null });
  const icons = [16, 48, 128].map((s) => `icons/icon${s}.png`);
  const at = placesIn(dir, [...wanted, 'manifest.json', ...icons, ...agentFiles.map((f) => f.path)]);
  // The icons first, each within a megabyte and half a minute, and nothing written until they are in: a Toolaby server at another
  // address (--server, TOOLABY_SERVER) could send one without end, and the new folder took it until the disk was full
  // (25 Sep 2026).
  const iconBytes = {};
  for (const icon of icons) {
    const got = await fetchBounded(`${wall}/boilerplate/${icon}`).catch((e) => ({ why: e.name === 'TimeoutError' ? 'it took longer than 30 seconds' : oneLine(e.message) }));
    if (got.why || !got.body) fail(`Toolaby at ${wall} did not send ${icon}: ${got.why ?? 'it sent more than a megabyte, which no icon is'}. Nothing was written.`);
    iconBytes[icon] = got.body;
  }
  const write = (rel, content) => { mkdirSync(dirname(at[rel]), { recursive: true }); writeFileSync(at[rel], content); };
  // Both surfaces, and the panel drawn inside them: no page of Toolaby's stands in front, so both names stay empty.
  for (const f of wanted) write(f, fillPages(plan.files[f]));
  // The manifest names the side panel only now that the page is beside it — an extension whose side_panel points at a
  // missing file does not load at all, so a Toolaby server that stops serving the page must not leave the key behind either.
  // The extension's identity too: every copy gets the id the tool key is bound to, wherever its folder is.
  write('manifest.json', JSON.stringify(scaffoldManifest(JSON.parse(readText(at['manifest.json'])), { sidePanel: hasSidePanel(surfaces), popup: hasPopup(surfaces), key: plan.identity?.manifestKey ?? null }), null, 2) + '\n');
  for (const icon of icons) write(icon, iconBytes[icon]);
  for (const f of agentFiles) write(f.path, f.content);
  const clicking = { both: 'Click the icon: the popup shows what the Free plan holds. Open side panel, in it, is the same page at the panel\'s width', popup: 'Click the icon: the popup shows what the Free plan holds', 'side-panel': 'Click the icon: the side panel opens — it has no popup, so the click is the panel\'s', none: 'No popup and no side panel: nothing opens on a click. Your code says when to sell — toolaby.openPaymentPage()' }[surfaces];
  out(`\n  ${oneLine(plan.name)} → ${dir}${surfaces === 'both' ? '' : `  (--surfaces ${surfaces})`}\n\n    1. chrome://extensions → Developer mode → Load unpacked → ${dir}\n    2. ${clicking}; Buy opens ${oneLine(plan.buyer ?? `${plan.site}/tools/${slug}`)}\n\n  Edit background.js: your work goes behind toolaby.gate().\n  Surfaces, and how to add or drop one later: ${wall}/docs/surfaces\n`);
  if (typeof plan.files['TOOLABY.md'] === 'string') out(`  With a coding agent: AGENTS.md, TOOLABY.md and the skills tell it how this extension sells. Toolaby's MCP server\n  in every agent on this computer (Claude Code, Codex, Cursor, VS Code, Gemini):\n    npx -y toolaby@latest agents${liveFlag}\n`);
}

// ── webhooks: the catalogue, and a delivery on demand ───────────────────────────────────────────────────────────────
//
// `trigger <event>` sends the catalogue's example of the event through
// Toolaby to every endpoint the workspace registered — signed, logged, retried,
// as a real one. `trigger <event> --to <url>` skips Toolaby: the command
// signs the example itself, Standard Webhooks style, with a secret you name
// (or one it prints) and POSTs it to the URL — a server on localhost, no
// tunnel, no deploy — so a handler can be written and run before anything
// is registered.
// This machine's development secret: made once, kept beside the credentials (mode 600), never the same as anyone
// else's. It was one constant, shipped in the package and printed in the docs, and a server deployed with it took
// forged events from anyone (25 Sep 2026).
const DEV_SECRET_FILE = join(CONFIG_DIR, 'dev-webhook-secret');
function devSecret() {
  try { const kept = readFileSync(DEV_SECRET_FILE, 'utf8').trim(); if (/^whsec_[A-Za-z0-9+/=]{20,}$/.test(kept)) return kept; } catch { /* made below */ }
  const made = `whsec_${randomBytes(24).toString('base64')}`;
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(DEV_SECRET_FILE, made + '\n', { mode: 0o600 });
  try { chmodSync(DEV_SECRET_FILE, 0o600); } catch { /* not every filesystem has modes */ }
  return made;
}
async function catalogue() {
  const res = await api('/api/cli/webhooks/events', { token: await tokenOrLogin() });
  if (res.status === 401) fail(`The session for ${side} is no longer valid. Run \`npx -y toolaby@latest login${liveFlag}\`.`);
  if (!res.ok) fail(`Toolaby answered HTTP ${res.status}.`);
  return res.json.events;
}
async function webhooks() {
  const sub = positional[0];
  if (sub === 'events') {
    const events = await catalogue();
    // Each event with an example of what it carries, for the handler that reads it (an agent wanted the real shapes).
    if (flag('--json')) { console.log(JSON.stringify({ side, events }, null, 2)); return; }
    out(`\n  ${side}\n`);
    for (const e of events) out(`    ${oneLine(e.type).padEnd(26)} ${oneLine(e.description)}`);
    say(`\n  ${dim('--json prints each one with an example of what it carries.')}`);
    const next = [[`trigger <event>${liveFlag}`, 'your registered endpoints'], ['trigger <event> --to <url>', "a local server, signed with this machine's development secret"], ['secret', "that secret, for the local server's TOOLABY_WEBHOOK_SECRET"]];
    const width = Math.max(...next.map(([c]) => c.length));
    out(`\n${next.map(([c, what]) => `  npx -y toolaby@latest webhooks ${c.padEnd(width)}  → ${what}`).join('\n')}\n`);
    return;
  }
  if (sub === 'secret') {
    // For the server on this machine: `TOOLABY_WEBHOOK_SECRET=$(npx -y toolaby@latest webhooks secret) node server.mjs`.
    process.stdout.write(devSecret() + '\n');
    return;
  }
  if (sub === 'trigger') {
    const type = positional[1];
    if (!type) fail('usage: npx -y toolaby@latest webhooks trigger <event> [--to <url>] [--secret <whsec_…>]   — `npx -y toolaby@latest webhooks events` lists them');
    const to = opt('--to');
    if (!to) {
      const res = await api('/api/cli/webhooks/trigger', { method: 'POST', body: { type, workspace: opt('--workspace') ?? undefined }, token: await tokenOrLogin() });
      if (!res.ok) fail(oneLine(res.json.message ?? `Toolaby answered HTTP ${res.status}.`));
      out(`\n  Sent ${oneLine(res.json.sent)} to every endpoint of ${oneLine(res.json.workspace)} · ${side}. Its id is ${oneLine(res.json.id)}; the delivery log is under Configure → Webhooks.\n`);
      return;
    }
    const events = await catalogue();
    const event = events.find((e) => e.type === type);
    if (!event) fail(`No event "${type}". \`npx -y toolaby@latest webhooks events\` lists them.`);
    const secret = opt('--secret') ?? devSecret();
    if (!/^whsec_[A-Za-z0-9+/=]+$/.test(secret)) fail('--secret must be a Standard Webhooks secret: whsec_ followed by base64.');
    const id = `msg_${randomBytes(12).toString('base64url')}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ id: `evt_${type.replace('.', '_')}_${Date.now().toString(36)}`, type, created: timestamp, livemode: false, data: event.example });
    const signature = 'v1,' + createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${timestamp}.${body}`).digest('base64');
    let res;
    try {
      res = await fetch(to, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': signature, 'User-Agent': `toolaby-cli/${VERSION}` }, body });
    } catch (e) { fail(`Could not reach ${to}: ${e.message}`); }
    const text = (await res.text()).slice(0, 200);
    out(`\n  POST ${to}  →  ${res.status}${text ? `  ${oneLine(text)}` : ''}`);
    out(`  ${type}, signed with ${opt('--secret') ? 'your secret' : "this machine's development secret — `npx -y toolaby@latest webhooks secret` prints it for TOOLABY_WEBHOOK_SECRET"}.\n`);
    if (res.status >= 300) out('  A real delivery would be retried until your server answers 2xx.\n');
    // A server tested this way still gets no real event: an agent built and tested a receiver and never registered it (2 Oct 2026).
    out(`  Real events go only to a registered endpoint: \`npx -y toolaby@latest webhooks add <your server's public url>${liveFlag} --env-file .env\` registers it and writes its signing secret into .env as TOOLABY_WEBHOOK_SECRET.\n`);
    return;
  }
  if (sub === 'endpoints') {
    const ws = opt('--workspace');
    const res = await api(`/api/cli/webhooks/endpoints${ws ? `?workspace=${encodeURIComponent(ws)}` : ''}`, { token: await tokenOrLogin() });
    if (!res.ok) fail(oneLine(res.json.message ?? `Toolaby answered HTTP ${res.status}.`));
    out(`\n  ${oneLine(res.json.workspace)} · ${side}\n`);
    if (res.json.endpoints.length === 0) out(`    None yet. \`npx -y toolaby@latest webhooks add <url>${liveFlag}\` registers one.`);
    for (const e of res.json.endpoints) out(`    ${oneLine(e.id)}  ${e.disabled ? 'paused ' : 'on     '} ${oneLine(e.url)}${e.description ? `  — ${oneLine(e.description)}` : ''}${e.events.length ? `  (${oneLine(e.events.join(', '))})` : ''}`);
    out();
    return;
  }
  if (sub === 'add') {
    const url = positional[1];
    if (!url) fail('usage: npx -y toolaby@latest webhooks add <url> [--description <text>] [--events a.b,c.d] [--workspace <slug>] [--env-file .env]');
    const envFile = opt('--env-file');
    // The MCP server's checks (lib/kit.js addWebhook), which this one had not: it wrote through a link to wherever it
    // pointed, and whatever a Toolaby server at another address answered, line breaks and lines of its own included.
    const refused = envFile ? envFileRefusal(resolve(envFile), 'the signing secret') : null;
    if (refused) fail(refused);
    const events = (opt('--events') ?? '').split(',').map((e) => e.trim()).filter(Boolean);
    const res = await api('/api/cli/webhooks/endpoints', { method: 'POST', body: { url, description: opt('--description') ?? '', events, workspace: opt('--workspace') ?? undefined }, token: await tokenOrLogin() });
    if (!res.ok) fail(oneLine(res.json.message ?? `Toolaby answered HTTP ${res.status}.`));
    // With --env-file the secret goes into the file and is never printed: a secret in an agent's chat is in its logs.
    if (envFile) {
      if (typeof res.json.secret !== 'string' || !WEBHOOK_SECRET.test(res.json.secret)) fail(`Toolaby registered ${oneLine(res.json.id ?? 'the endpoint')} but answered without its secret; nothing was written. \`npx -y toolaby@latest webhooks remove ${oneLine(res.json.id ?? '<id>')}${liveFlag}\`, then add it again.`);
      const wrote = setEnvValues(resolve(envFile), { TOOLABY_WEBHOOK_SECRET: res.json.secret });
      out(`\n  Added ${oneLine(res.json.id)} → ${oneLine(res.json.url)} · ${oneLine(res.json.workspace)} · ${side}\n\n  Its signing secret is in ${resolve(envFile)} as TOOLABY_WEBHOOK_SECRET${wrote.replaced.TOOLABY_WEBHOOK_SECRET ? ', replacing the one there' : ''}; it is not shown.${wrote.gitignored ? '' : ` ${basename(envFile)} is not in .gitignore: add it before you commit.`}\n`);
      return;
    }
    out(`\n  Added ${oneLine(res.json.id)} → ${oneLine(res.json.url)} · ${oneLine(res.json.workspace)} · ${side}\n\n  Signing secret, shown once — keep it where your server keeps secrets (--env-file .env writes it there instead):\n\n    ${oneLine(res.json.secret)}\n`);
    return;
  }
  if (sub === 'remove') {
    const id = positional[1];
    if (!id) fail('usage: npx -y toolaby@latest webhooks remove <ep_…> [--workspace <slug>]   — `npx -y toolaby@latest webhooks endpoints` lists them');
    const res = await api('/api/cli/webhooks/endpoints', { method: 'DELETE', body: { id, workspace: opt('--workspace') ?? undefined }, token: await tokenOrLogin() });
    if (!res.ok) fail(oneLine(res.json.message ?? `Toolaby answered HTTP ${res.status}.`));
    out(`\n  Removed ${oneLine(res.json.removed)} · ${oneLine(res.json.workspace)} · ${side}. Deliveries to it stop at once.\n`);
    return;
  }
  fail('usage: npx -y toolaby@latest webhooks events | trigger <event> [--to <url>] | endpoints | add <url> | remove <id>');
}

// ── pack: the zip the Chrome Web Store takes ──────────────────────────────────────────────────────────────────────────
// The built extension, zipped, with the manifest's `key` left out: the store refuses a key in a new item's first
// package and any key but the item's own in an update, and it keeps the id it gave the item either way — Toolaby
// admits that id once the listing's address is on the tool. It refuses a build that would sell on Test (a tk_test_
// or tk_dev_ key inside) or that points at this machine (localhost in the manifest), the two mistakes a store build
// can ship with. What looks private — a key, an environment file, a source map — is left out and named, and so is a
// link out of the folder: a store zip is public. A build it would leave a file of the manifest's out of, which Chrome
// would not load, is refused, as is one whose public folder is a link into .git (round 9, 25 Sep 2026). Nothing is
// sent anywhere: it reads the folder and writes one file.
const BUILD_DIRS = ['.', '.output/chrome-mv3', 'dist', 'build/chrome-mv3-prod', 'build'];
const TOOL_KEY = /tk_(test|live|dev)_[A-Za-z0-9_-]{20,}/g;
const LOCAL = /^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\]|[^/]*\.localhost)(:\d+)?\//i;
/** Why a file is left out as no file of the folder's own, not as a private one: never packed, --allow-private or not. */
const NOT_OWN = ['a link', 'not a file', 'a name no zip should hold'];
/** What pack never takes and never says it left out: a folder's dot-names, its node_modules, a zip beside the build. */
const NEVER_PACKED = ['a name starting with a dot, never packed', 'node_modules, never packed', 'a zip, never packed'];

/**
 * The files a manifest names, each with what it is to the extension, as the zip spells them: no leading ./ or /, no
 * query or fragment. A pattern (a web-accessible resource's `*`) names no one file, and an address none at all.
 */
function namedFiles(manifest) {
  const named = [];
  const add = (path, what) => {
    if (typeof path !== 'string' || path.includes('*') || /^[a-z][a-z0-9+.-]*:/i.test(path)) return;
    const clean = posix.normalize(path.split(/[?#]/)[0].replace(/^(?:\.?\/)+/, ''));
    if (clean && clean !== '.' && clean !== '..' && !clean.startsWith('../')) named.push([clean, what]);
  };
  const list = (value) => (Array.isArray(value) ? value : []);
  const icons = (value) => { for (const path of value && typeof value === 'object' ? Object.values(value) : [value]) add(path, 'an icon'); };
  add('manifest.json', 'the manifest');
  add(manifest.background?.service_worker, 'the background service worker');
  for (const path of list(manifest.background?.scripts)) add(path, 'a background script');
  add(manifest.background?.page, 'the background page');
  for (const script of list(manifest.content_scripts)) {
    for (const path of list(script?.js)) add(path, 'a content script');
    for (const path of list(script?.css)) add(path, "a content script's style sheet");
  }
  for (const surface of ['action', 'browser_action', 'page_action']) { add(manifest[surface]?.default_popup, 'the popup'); icons(manifest[surface]?.default_icon); }
  add(manifest.side_panel?.default_path, 'the side panel');
  add(manifest.sidebar_action?.default_panel, 'the side panel');
  icons(manifest.sidebar_action?.default_icon);
  add(manifest.options_page, 'the options page');
  add(manifest.options_ui?.page, 'the options page');
  add(manifest.devtools_page, 'the DevTools page');
  if (manifest.chrome_url_overrides && typeof manifest.chrome_url_overrides === 'object') for (const path of Object.values(manifest.chrome_url_overrides)) add(path, 'a page it replaces');
  for (const path of list(manifest.sandbox?.pages)) add(path, 'a sandboxed page');
  icons(manifest.icons);
  for (const entry of list(manifest.web_accessible_resources)) for (const path of typeof entry === 'string' ? [entry] : list(entry?.resources)) add(path, 'a web-accessible resource');
  for (const rules of list(manifest.declarative_net_request?.rule_resources)) add(rules?.path, 'a rule set');
  add(manifest.storage?.managed_schema, 'its managed storage schema');
  if (typeof manifest.default_locale === 'string') add(`_locales/${manifest.default_locale}/messages.json`, 'its default locale');
  return named;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A zip of [name, bytes] pairs: deflated where that is smaller, stored otherwise, every entry dated 1 Jan 1980 so the same build packs to the same bytes. */
function zipOf(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const method = deflated.length < data.length ? 8 : 0;
    const body = method === 8 ? deflated : data;
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(method, 8);
    head.writeUInt16LE(0, 10); head.writeUInt16LE(0x21, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26); head.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0x21, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(head, nameBuf, body); centrals.push(central, nameBuf);
    offset += head.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/**
 * What goes in the zip: every file in the folder but dotfiles, node_modules and zips — and, left out with the reason,
 * a file that looks private by its name or its contents (lib/safe.js), which --allow-private packs anyway, and never a
 * link: one out of the folder can put ~/.ssh/id_rsa in a store zip as logo.png, and one inside it the folder's own
 * .env or .git, under an innocent name (25 Sep 2026). Nor a name no zip should hold — a backslash, which unzips as a
 * folder, or a control character — nor anything but a file. A zip is public once the store serves it.
 *
 * A build has already followed the links of the project it came from: what they pointed at is an ordinary file here.
 * So a file is also private when it is a copy of one of the project's (`copyOf`), a folder when it is a git
 * repository's own, and a file named as an image when it holds none (round 7, 25 Sep 2026).
 *
 * And a compressed file is what it holds (round 8, 25 Sep 2026): a build's compression plugin writes data.json.gz and
 * data.json.br beside data.json, and `pack` left data.json out as private while it packed both. One beside a file left
 * out goes with it, however large; any other is opened, a few MB of it at most (lib/safe.js), and judged as the file.
 *
 * And git's other files are git's, whatever their names — its index, its refs, its logs, a config (round 9, 25 Sep 2026).
 */
function filesIn(root, copyOf = () => null, fromLink = () => null) {
  const found = []; const left = []; const privately = []; const skipped = [];
  const allowed = flag('--allow-private');
  const judge = (name, bytes) => privateKind(name) ?? copyOf(bytes) ?? privateContent(bytes) ?? gitObject(bytes) ?? gitFile(bytes) ?? notAnImage(name, bytes);
  const judged = new Map(); // what each file found private is, by its path: a compressed one beside it is the same
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const rel = relative(root, p).split(sep).join('/');
      // Never packed, and not said: kept apart all the same, so a manifest that names one is still refused below — a
      // content script under node_modules or a dot-folder made a zip Chrome did not load (29 Sep 2026).
      if (name.startsWith('.') || name === 'node_modules' || name.endsWith('.zip')) { skipped.push([rel, NEVER_PACKED[name.startsWith('.') ? 0 : name === 'node_modules' ? 1 : 2]]); continue; }
      const st = lstatSync(p);
      if (st.isSymbolicLink()) { left.push([rel, 'a link']); continue; }
      if (/[\\\u0000-\u001f\u007f]/.test(name)) { left.push([rel, 'a name no zip should hold']); continue; }
      // What a build copied from a link into .git, or to a private file, left out whole, as the link's (round 8).
      const via = fromLink(rel);
      if (via) { judged.set(rel, via); if (!allowed) { left.push([rel, via]); continue; } privately.push([rel, via]); }
      if (st.isDirectory()) {
        // Left out whole, unwalked: its config and its history are the repository's, whatever the folder is called.
        const git = gitDirectory(p) ? 'a git directory' : gitObjects(p) ? 'git history' : null;
        if (git && !via) { if (!allowed) { left.push([rel, git]); continue; } privately.push([rel, git]); }
        walk(p);
        continue;
      }
      if (!st.isFile()) { left.push([rel, 'not a file']); continue; }
      const bytes = readFileSync(p);
      let why = judge(name, bytes);
      if (!why) {
        // Sorted, data.json comes before data.json.br and data.json.gz: its verdict is known when theirs is asked.
        const twin = COMPRESSED.test(name) ? judged.get(rel.replace(COMPRESSED, '')) : null;
        const inner = twin ? null : unpacked(name, bytes);
        const held = twin ?? (inner && judge(inner.name, inner.bytes));
        if (held) why = `${held}, compressed`;
      }
      if (why) judged.set(rel, why);
      if (why && !allowed) left.push([rel, why]);
      else { found.push(p); if (why) privately.push([rel, why]); }
    }
  };
  walk(root);
  return { found, left, privately, skipped };
}

/** A path as the developer knows it: under their home folder, from ~. */
const fromHome = (path) => (path.startsWith(homedir() + sep) ? `~${path.slice(homedir().length)}` : path);

function pack() {
  const given = positional[0];
  const folder = given ? resolve(given) : BUILD_DIRS.map((d) => resolve(d)).find((d) => existsSync(join(d, 'manifest.json')));
  if (!folder || !existsSync(join(folder, 'manifest.json'))) fail(given ? `No manifest.json in ${given}.` : `No manifest.json here or in ${BUILD_DIRS.slice(1).join(', ')}. Build first, or name the folder: npx -y toolaby@latest pack <folder>.`);
  let manifest;
  // The parser's message quotes the file it could not read, line breaks and all.
  try { manifest = JSON.parse(readText(join(folder, 'manifest.json'))); } catch (e) { fail(`manifest.json does not parse: ${oneLine(e.message)}`); }
  if (!manifest.version) fail('manifest.json has no "version".');
  // One to four numbers, as Chrome and the store take it — and a file name here: the zip is named with it, and a
  // version with "../" in it put the zip outside the folder.
  if (typeof manifest.version !== 'string' || !/^\d{1,5}(\.\d{1,5}){0,3}$/.test(manifest.version)) fail(`manifest.json's "version" is ${JSON.stringify(manifest.version)}: Chrome takes one to four numbers separated by dots, like 1.2.0.`);
  // The project the build came from — or, with none above it, the folder alone — and the command's own secrets: what a
  // build could have copied in under another name, by following a link (lib/safe.js).
  const project = projectRoot(folder);
  const allowed = flag('--allow-private');
  const copyOf = privateCopies(project ?? folder, [[CREDENTIALS, `${fromHome(CREDENTIALS)}, this command's session`], [DEV_SECRET_FILE, `${fromHome(DEV_SECRET_FILE)}, this machine's webhook secret`]]);
  // What a link in the project's public folders put into the build, when it points into .git or at a private file.
  const leaking = project ? privateLinks(project, folder) : [];
  // A public folder that is itself such a link, or a build whose top is a git repository's own folder, is refused: the
  // build copied what the link points at to the top of its output, among the extension's own files, and nothing tells
  // them apart — `public -> .git` put the repository's index, its logs and its last commit message in the zip (round 9,
  // 25 Sep 2026).
  const whole = leaking.filter((l) => !l.within);
  if (whole.length && !allowed) fail(`Not packed: ${whole.map((l) => `${oneLine(l.link)} is ${l.why}`).join(', ')}. A build copies what a public folder links to, whole, to the top of its output.\n  Make ${whole.length > 1 ? 'each' : 'it'} a folder of its own, build again, and pack. (--allow-private packs it anyway.)`);
  if (gitDirectory(folder) && !allowed) fail(`Not packed: ${oneLine(relative(process.cwd(), folder) || '.')} is a git repository's own folder (HEAD, config and its history), as a build leaves when its public folder is a link to .git.\n  Make the public folder a folder of its own, build again, and pack. (--allow-private packs it anyway.)`);
  const fromLink = (rel) => { const hit = leaking.find((l) => l.within && (rel === l.within || rel.startsWith(`${l.within}/`))); return hit ? `from ${hit.link}, ${hit.why}` : null; };
  const { found: files, left, privately, skipped } = filesIn(folder, copyOf, fromLink);
  // What was left out as no file of the folder's own, and what as private.
  const links = left.filter(([, why]) => NOT_OWN.includes(why));
  const kept = left.filter((entry) => !links.includes(entry));

  // A file the manifest names that is left out makes a zip Chrome does not load, or loads without its worker, a page or
  // an icon: refused, and nothing written (round 9, 25 Sep 2026). --allow-private packs a private one; a link, never.
  const broken = [];
  for (const [path, what] of namedFiles(manifest)) {
    const named = ([rel]) => path.toLowerCase() === rel.toLowerCase() || path.toLowerCase().startsWith(`${rel.toLowerCase()}/`);
    const gone = left.find(named) ?? skipped.find(named);
    if (gone && !broken.some(([p]) => p === path)) broken.push([path, what, gone[1]]);
  }
  if (broken.length) {
    const secret = broken.filter(([, , why]) => !NOT_OWN.includes(why) && !NEVER_PACKED.includes(why)).length;
    const never = broken.filter(([, , why]) => NEVER_PACKED.includes(why)).length;
    const advice = [
      secret && `Take out what is private and build again, or pack ${secret > 1 ? 'them' : 'it'} anyway with --allow-private, for anyone who downloads the item to read.`,
      broken.some(([, , why]) => NOT_OWN.includes(why)) && 'The zip holds the folder\'s own files, and never a link: make each the file itself.',
      never && `A zip never holds a dot-name, node_modules or another zip: put ${never > 1 ? 'them' : 'it'} among the extension's own files, as a bundler does.`,
    ].filter(Boolean);
    fail(`Not packed: the manifest names ${broken.length > 1 ? 'files' : 'a file'} this leaves out, and the zip would not load:\n\n${broken.map(([path, what, why]) => `  · ${oneLine(path)}, ${what} (${oneLine(why)})`).join('\n')}\n\n  ${advice.join('\n  ')}`);
  }
  const problems = [];

  // Which side the build sells on: the tool keys inside it, wherever the bundler put them.
  const modes = new Set(); const sites = new Set();
  for (const f of files) {
    if (!/\.(m?js|html|json)$/.test(f)) continue;
    for (const [k, mode] of readFileSync(f, 'utf8').matchAll(TOOL_KEY)) {
      modes.add(mode);
      try { const facts = JSON.parse(Buffer.from(k.split('_')[2], 'base64url').toString('utf8')); if (typeof facts.s === 'string') sites.add(facts.s.replace(/\/$/, '')); } catch { /* not a key after all */ }
    }
  }
  if ((modes.has('test') || modes.has('dev')) && !flag('--allow-test')) problems.push(`It carries a ${[...modes].filter((m) => m !== 'live').map((m) => `tk_${m}_`).join(' and ')} key: it would sell on ${modes.has('test') ? 'Test, with test cards' : 'a development server'}. Run \`npx -y toolaby@latest wire <tool-id> --live --force\`, build again, then pack. (--allow-test packs it anyway, for a build you will not publish.)`);
  if (modes.size === 0) out('\n  No tool key found in the build: it is not wired to Toolaby, or the key is somewhere this cannot read. Packing anyway.');

  // Addresses of this machine have no place in a store build.
  const local = [...(manifest.host_permissions ?? []), ...(manifest.externally_connectable?.matches ?? [])].filter((m) => typeof m === 'string' && LOCAL.test(m));
  if (local.length && !flag('--allow-local')) problems.push(`The manifest points at this machine: ${local.map(oneLine).join(', ')}. A store build has no localhost in host_permissions or externally_connectable. (--allow-local packs it anyway.)`);

  // Toolaby the key names must reach the extension, or sign-in and the purchase handoff fail. It needs no host
  // permission (wiring/manifest): one for it is said, not refused — a copy already published with it asks no one
  // anything again, but one that adds it is switched off by Chrome until each user approves it.
  for (const site of sites) {
    const ec = manifest.externally_connectable?.matches ?? [];
    if (!ec.includes(sitePattern(site))) problems.push(`The manifest does not name ${oneLine(sitePattern(site))} under externally_connectable: sign-in and the purchase would not reach the extension. \`npx -y toolaby@latest wire <tool-id> --live --force\` adds it.`);
    if ((manifest.host_permissions ?? []).includes(sitePattern(site))) out(`\n  host_permissions names ${oneLine(sitePattern(site))}, which Toolaby no longer needs, and Chrome shows it to everyone installing. Where the version in the store lacks it, Chrome also switches this update off until each user approves it. \`npx -y toolaby@latest upgrade <tool-id> --live\` takes it out.`);
  }
  // A host under Toolaby's address that no key in the build names: another workspace's, or the other side's Test
  // address, left by an earlier wiring or pasted by hand. The store build asks its buyers for it at install, and gains
  // nothing: the extension talks to its own key's host alone (30 Sep 2026).
  const walls = [...new Set(['toolaby.app', new URL(wall).hostname])];
  const hostOf = (m) => /^(?:\*|https?|wss?):\/\/([^/]+)\//.exec(m)?.[1]?.replace(/^\*\./, '').toLowerCase() ?? null;
  const keys = new Set([...sites].map(sitePattern));
  const strangers = [...new Set([...(manifest.host_permissions ?? []), ...(manifest.externally_connectable?.matches ?? [])])]
    .filter((m) => typeof m === 'string' && !keys.has(m) && walls.some((w) => { const h = hostOf(m); return !!h && (h === w || h.endsWith(`.${w}`)); }));
  if (strangers.length && !flag('--allow-toolaby-hosts')) problems.push(`The manifest names ${strangers.map(oneLine).join(', ')}: Toolaby's, and no key's in this build — another workspace, or the other side's Test address. A store build asks its buyers for ${strangers.length > 1 ? 'these' : 'it'} at install for nothing: take ${strangers.length > 1 ? 'them' : 'it'} out of host_permissions and externally_connectable. (--allow-toolaby-hosts packs it anyway.)`);
  if (problems.length) fail(`Not packed:\n\n${problems.map((p) => `  · ${p}`).join('\n\n')}`);

  const hadKey = typeof manifest.key === 'string';
  const { key: _key, ...forStore } = manifest;
  const entries = files.map((f) => {
    const name = relative(folder, f).split(sep).join('/');
    return [name, name === 'manifest.json' ? Buffer.from(JSON.stringify(forStore, null, 2) + '\n') : readFileSync(f)];
  });
  // Named after the extension, or after its folder when the name is a __MSG_…__ placeholder.
  const named = typeof manifest.name === 'string' && !manifest.name.startsWith('__MSG_') ? manifest.name : basename(folder);
  const safe = named.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'extension';
  const target = resolve(opt('--out') ?? `${safe}-${manifest.version}.zip`);
  // Written beside it under a name nobody could have made, then moved over it: a link a cloned project left under the
  // zip's own name took the write wherever it pointed (25 Sep 2026). A move replaces the link itself.
  const fresh = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.part`;
  writeFileSync(fresh, zipOf(entries), { flag: 'wx' });
  renameSync(fresh, target);
  const kb = (statSync(target).size / 1024).toFixed(0);
  out(`\n  ${relative(process.cwd(), target) || target}  ·  ${entries.length} files, ${kb} KB  ·  version ${manifest.version}${modes.has('live') ? '  ·  Live key' : ''}`);
  // What was left out, and why — or, asked for, what private file went in: a store zip is public. A reason can name a
  // file of the project's (a copy of…, from a link…), and so is put on one line, as the file's own name is.
  if (kept.length) out(`  Left out, as private: ${kept.map(([f, why]) => `${oneLine(f)} (${oneLine(why)})`).join(', ')}. Anyone can download a store item and unzip it; --allow-private packs ${kept.length > 1 ? 'them' : 'it'} anyway.`);
  if (links.length) out(`  Left out: ${links.map(([f, why]) => `${oneLine(f)} (${why})`).join(', ')}. The zip holds the folder's own files: copy in what belongs in it.`);
  if (privately.length) out(`  Packed as asked (--allow-private): ${privately.map(([f, why]) => `${oneLine(f)} (${oneLine(why)})`).join(', ')}. Anyone who downloads the item can read ${privately.length > 1 ? 'them' : 'it'}.`);
  // Packed and named: a Google API key is made to be in a browser, and kept to its use by its restrictions (lib/safe.js).
  const google = entries.filter(([, bytes]) => googleKey(bytes)).map(([name]) => oneLine(name));
  if (google.length) out(`  ${google.length > 1 ? 'Google API keys are' : 'A Google API key is'} in ${google.join(', ')}: anyone who downloads the item can read ${google.length > 1 ? 'them' : 'it'}. Restrict ${google.length > 1 ? 'each' : 'it'} to this extension, and to the APIs it calls, in Google Cloud → Credentials.`);
  // Said, not refused: the links are the project's, not the build's, and the build may hold nothing of theirs yet.
  const linked = project ? publicLinks(project, folder) : [];
  if (linked.length) out(`  Links in the folders a build copies as they are: ${linked.slice(0, 8).map(oneLine).join(', ')}${linked.length > 8 ? ` and ${linked.length - 8} more` : ''}. The build copies what each points at, a private file too: make each the file itself.`);
  if (hadKey) out('  The manifest\'s "key" is left out: the store keeps the id it gives the item. Your unpacked copy keeps the key and its own id; Toolaby admits both once the listing\'s address is on the tool.');
  out('  Upload it at https://chrome.google.com/webstore/devconsole — a new item, or Package → Upload new package.\n');
}

// ── mcp and check: Toolaby for coding agents ──────────────────────────────────────────────────────────────────────
function mcp() {
  // Every word to stdout is a protocol message here: the session is the stored one, or the one toolaby_sign_in gets.
  runMcp({ version: VERSION, side, wall, token: storedToken, ctx: kitContext(kitDeps()), newer: newerToolaby });
  return new Promise(() => {}); // until stdin closes
}

async function check() {
  // The folder: --into, or the first word that is no option's value (`check --built dist` checks this folder's build).
  const valued = new Set(['--into', '--built', '--server', '--as', '--out']);
  const folder = opt('--into') ?? rest.find((a, i) => !a.startsWith('--') && !valued.has(rest[i - 1])) ?? '.';
  const asJson = flag('--json');
  // Each finding as it is made, its fix under it when the words do not already say it; with --json, the answer alone.
  const show = (f) => {
    say(`  ${f.level === 'ok' ? green('✓') : f.level === 'warn' ? yellow('!') : red('✗')} ${plain(f.message)}`);
    if (f.fix && !f.message.includes(f.fix)) say(`      ${cyan(plain(f.fix))}`);
  };
  if (!asJson) out(`\n  Checking ${resolve(folder)}\n`);
  const result = await runCheck({ folder, side, wall, api: (path, o = {}) => api(path, o), token: storedToken, built: opt('--built'), browser: flag('--browser') || !!opt('--as'), as: opt('--as'), json: asJson, onFinding: asJson ? null : show });
  const n = (level) => result.findings.filter((f) => f.level === level).length;
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else out(`\n  ${n('error') ? `${n('error')} to fix` : 'Nothing to fix'}${n('warn') ? `, ${n('warn')} to look at` : ''}.\n`);
  // 1 when something must be fixed; warnings alone leave it 0.
  if (!result.ok) process.exitCode = 1;
}


// ── The kit: every operation of lib/ops.js as a command, the same one an agent's MCP client calls ───────────────────
/** The session for one of the two sides, as `login` stored it (or TOOLABY_TOKEN, for the side it is for). */
const tokenFor = (base) => (process.env.TOOLABY_TOKEN && !envRefused && tokenWall === base ? process.env.TOOLABY_TOKEN : readCredentials()[base]?.token || null);
const saveSession = (base, token, email) => { const all = readCredentials(); all[base] = { token, email, at: new Date().toISOString() }; writeCredentials(all); };
const kitDeps = () => ({ wall, side, api, storedToken, tokenFor, saveSession, configDir: CONFIG_DIR });

/** A line for a person, from an answer: what the operation says, or what it holds. */
function shown(op, json) {
  if (op.name === 'toolaby_get_tool') {
    say(`\n  ${bold(json.name)}  ${dim(json.id)}  · ${plain(json.workspace)} · ${plain(side)}${json.active === false ? '  (off sale)' : ''}`);
    out(`\n  Free plan     ${json.freePlan?.holds ?? ''}`);
    out(`  Features      ${(json.features ?? []).map((f) => `${f.key}${f.free ? ' (free)' : ''}`).join(', ') || 'none'}`);
    for (const p of json.plans ?? []) out(`  Plan ${p.id.padEnd(9)}${p.name}  ${p.amount ?? ''} ${String(p.currency ?? '').toUpperCase()}${p.trialDays ? `  · ${p.trialDays}-day trial` : ''}${p.perSeat ? '  · per seat' : ''}  → ${(p.features ?? []).join(', ') || 'everything'}`);
    if (!(json.plans ?? []).length) out('  Plans         none yet: `npx -y toolaby@latest plan add …`');
    out(`  Extension     ${json.extension?.checkedInAt ? `checked in ${json.extension.checkedInAt}` : 'no copy has checked in yet'}`);
    out(`  Checkout      ${json.pages?.buyer ?? ''}\n`);
    return;
  }
  if (op.name === 'toolaby_list_customers') {
    out(`\n  ${json.total} customer${json.total === 1 ? '' : 's'} of ${json.tool}\n`);
    for (const c of json.customers ?? []) out(`    ${String(c.email).padEnd(36)} ${c.access?.label ?? ''}${c.access?.state ? ` · ${c.access.state}` : ''}`);
    out();
    return;
  }
  if (op.name === 'toolaby_get_customer') {
    say(`\n  ${plain(json.email)}  ${json.entitledVia ? green(`holds it · ${json.entitledVia}${json.plan ? ` · ${json.plan}` : ''}`) : yellow('holds nothing now')}\n`);
    for (const l of json.licences ?? []) out(`    licence ${l.id}  ${l.status}${l.refundedAt ? ' · refunded' : ''}${l.paidThroughStripe ? '' : ' · not paid through Stripe'}`);
    for (const x of json.subscriptions ?? []) out(`    subscription ${x.id}  ${x.plan} · ${x.status}${x.renews ? ` · renews ${x.periodEnd}` : x.endsAt ? ` · ends ${x.endsAt}` : ''}`);
    for (const g of json.grants ?? []) out(`    grant ${g.id}  ${g.kind}${g.revokedAt ? ' · revoked' : g.endsAt ? ` · until ${g.endsAt}` : ''}`);
    out();
    return;
  }
  if (op.name === 'toolaby_search_docs') {
    out(`\n  ${json.results?.length ? '' : 'Nothing matched.'}`);
    for (const r of json.results ?? []) { say(`  ${bold(r.page)}  ${dim(r.url)}`); for (const t of r.passages ?? []) out(`    ${t}`); }
    out();
    return;
  }
  say(`\n  ${plain(json.message ?? JSON.stringify(json, null, 2))}${json.next ? `\n  ${cyan(json.next)}` : ''}\n`);
  if (op.name === 'toolaby_test_unlock' && json.licence) say(`  ${dim(`Key ${json.licence.key} for ${json.licence.email}, kept for \`check --browser --as ${json.licence.plan}\`.`)}\n`);
}

/**
 * Which paywall people meet first, for an extension moving from ExtensionPay: Toolaby's (true) or its own (false), asked
 * once in a terminal. Without one — an agent, a script — the command stops before anything is written and says what to
 * ask the person, with the two commands to run (7 Oct 2026).
 */
async function paywallInFront(slug) {
  const why = [
    'ExtensionPay has its own "Pay now" page in front of this extension. Toolaby\'s paywall can go in front instead:',
    "people meet Toolaby's sign-in and plans when your dashboard says they can't use the extension yet, and your popup",
    'opens once they can. Opens are never counted. Nothing in your code is deleted: Toolaby answers its ExtPay calls,',
    'and `upgrade --own-popup` puts your page back in front at any time.',
  ];
  const into = opt('--into');
  const again = `npx -y toolaby@latest wire ${slug}${liveFlag}${into ? ` --into ${/^[\w@%+=:,./-]+$/.test(into) ? into : `'${into.replace(/'/g, "'\\''")}'`}` : ''} --from-extensionpay`;
  if (!process.stdin.isTTY) fail(`${why.join('\n  ')}\n\n  Ask your person which paywall goes in front, then run one of:\n  → ${again} --toolaby-popup   (Toolaby's sign-in and plans first; recommended)\n  → ${again} --own-popup   (ExtensionPay's page stays in front, as it was)\n\n  Nothing was written.`);
  process.stdout.write(`\n  ${yellow('?')} ${plain(why.join('\n    '))}\n\n  Put Toolaby's paywall in front? (Y/n) `);
  const line = await new Promise((done) => { process.stdin.setEncoding('utf8'); process.stdin.once('data', (d) => { process.stdin.pause(); done(String(d).trim()); }); });
  return !/^n/i.test(line);
}

/** Asks a person to type yes; refuses without a terminal unless --yes was given. */
async function confirmed(what) {
  if (flag('--yes')) return true;
  if (!process.stdin.isTTY) fail(`On ${side} this ${what}. Run it again with --yes to go ahead.`);
  process.stdout.write(`\n  On ${side} this ${what}.\n  Type yes to go ahead: `);
  const line = await new Promise((done) => { process.stdin.setEncoding('utf8'); process.stdin.once('data', (d) => { process.stdin.pause(); done(String(d).trim()); }); });
  return line === 'yes';
}

/** One operation, from the command line: `npx -y toolaby@latest <words> [args] [--flags] [--json]`. */
async function runOp(words) {
  const ops = opsFor(side);
  const op = opForWords(ops, words);
  if (!op) return false;
  if (op.testOnly && side === 'Live') fail(`${op.words.join(' ')} is for Test only.`);
  const asJson = flag('--json');
  const positional = words.slice(op.words.length);
  const got = argsFromCli(op, { positional, flagValue: (f) => opt(f), hasFlag: (f) => rest.includes(f), readFile: (f) => readFileSync(resolve(f), 'utf8') });
  if (got.error) { if (asJson) { console.log(JSON.stringify({ ok: false, error: 'usage', message: got.error })); process.exit(1); } fail(got.error); }
  if (!op.noSession && !storedToken()) {
    if (asJson || !process.stdin.isTTY) { const m = `Not signed in to Toolaby (${side}). Run \`npx -y toolaby@latest login${liveFlag} --no-wait --json\`, show the person the link and code, then \`login${liveFlag} --poll <deviceCode>\`.`; if (asJson) { console.log(JSON.stringify({ ok: false, error: 'signed_out', message: m })); process.exit(1); } fail(m); }
    await login();
  }
  if (op.destructive && side === 'Live' && !(await confirmed(op.description.split('.')[0].replace(/^./, (c) => c.toLowerCase()).replace(/^/, 'will: ')))) fail('Nothing was changed.');
  const res = await op.run(got.args, kitContext(kitDeps()));
  if (asJson) {
    console.log(typeof res.text === 'string' ? JSON.stringify({ ok: res.ok, text: res.text }) : JSON.stringify(res.ok ? res.json : { ok: false, status: res.status, ...res.json }, null, 2));
    if (!res.ok || (op.name === 'toolaby_check' && res.json?.ok === false)) process.exitCode = 1;
    return true;
  }
  if (!res.ok) fail(res.json?.message ?? res.json?.error ?? `Toolaby answered HTTP ${res.status}.`);
  if (typeof res.text === 'string') { console.log(res.text); return true; }
  shown(op, res.json);
  return true;
}

/** `login --no-wait --json` starts a sign-in and returns at once; `login --poll <deviceCode>` waits for it. */
async function loginCommand() {
  const asJson = flag('--json');
  const poll = opt('--poll');
  if (poll) {
    const r = await pollDeviceSignIn({ api, saveSession, wall }, { deviceCode: poll, every: 5000, lasts: 15 * 60_000 });
    if (asJson) { console.log(JSON.stringify({ signedIn: r.ok, email: r.email ?? null, side, ...(r.ok ? {} : { message: r.message }) })); if (!r.ok) process.exitCode = 1; return; }
    if (!r.ok) fail(r.message);
    out(`\n  Signed in${r.email ? ` as ${oneLine(r.email)}` : ''} · ${side}.\n`);
    return;
  }
  if (flag('--no-wait')) {
    const started = await startDeviceSignIn({ api, wall });
    if (!started.ok) { if (asJson) { console.log(JSON.stringify({ ok: false, message: started.message })); process.exit(1); } fail(started.message); }
    const answer = { url: started.url, code: started.code, deviceCode: started.deviceCode, expiresIn: Math.round(started.lasts / 1000), side, next: `npx -y toolaby@latest login${liveFlag} --poll ${started.deviceCode}` };
    if (asJson) console.log(JSON.stringify(answer, null, 2));
    else out(`\n  Open   ${started.url}\n  Code   ${started.code}\n\n  Then: ${answer.next}\n`);
    return;
  }
  await login();
}

/** `agents`: the MCP server in every coding agent here (or in the project's files with --project). */
function agents() {
  const results = setUpAgents({ clients: opt('--client') ?? 'all', project: flag('--project'), live });
  if (flag('--json')) { console.log(JSON.stringify({ server: live ? 'toolaby-live' : 'toolaby', results }, null, 2)); if (results.some((r) => r.status === 'failed')) process.exitCode = 1; return; }
  out(`\n  Toolaby's MCP server (${live ? 'toolaby-live, on Live' : 'toolaby, on Test'}) for your coding agents\n`);
  for (const r of results) say(`  ${r.status === 'done' ? green('✓') : r.status === 'already' ? green('·') : r.status === 'skipped' ? dim('–') : red('✗')} ${plain(r.client.padEnd(22))} ${plain(r.status === 'done' ? `added (${r.how})` : r.status === 'already' ? `already there (${r.how})` : r.why)}`);
  out(`\n  Restart the agent, or open a new session, to load it. It acts as the account you signed in with \`npx -y toolaby@latest login${liveFlag}\`.\n`);
  if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
}

function help() {
  out(`
  toolaby — the Toolaby command line (${VERSION})

    npx -y toolaby@latest <command>, or installed (npm i -g toolaby): toolaby-cli <command>. Needs Node.js 20 or later.

    wire <tool-id>                     wire the extension in this folder to your tool, on Test
    wire <tool-id> --live              the same, on Live: the store build
                                       --into <folder>   another folder     --force   replace the platform's files
                                       --own-popup       keep your popup in front (Toolaby's opens from toolaby.showPaywall())
                                       --toolaby-popup   put the Toolaby popup in front of yours (it opens yours at once)
                                       --adopt-key       make the extension this folder's manifest names the tool's own
                                       --from-extensionpay   move an extension that sells with ExtensionPay: its calls answered by
                                                         Toolaby, its plans copied; subscribers move with their cards and renewal
                                                         days, on Live: Import → From another Stripe account (toolaby.app/docs/extensionpay)
    upgrade <tool-id>                  the platform's files replaced with the current ones — the popup, the client — yours untouched
    upgrade <tool-id> --live           the same, with the Live key: run it before you build for the store   --into <folder>
    create <tool-id>                   a new, minimal extension for your tool, in <tool-id>/   --dir <folder>
                                       --surfaces both|popup|side-panel|none   what it opens (default: both)
    check [folder]                     whether the extension here is wired right; findings with codes, a fix and a docs link
                                       --json   the findings as JSON        --built <dir>   check a build (.output/chrome-mv3, dist)
                                       --browser   load it in Chromium and ask its background (Playwright, fetched once)
                                       --as <plan>   with the test licence test-unlock made: prove the plan's features unlock
    pack [folder]                      the zip for the Chrome Web Store: the built extension, its manifest's "key" left out;
                                       refuses a Test key, localhost, or another of Toolaby's hosts inside
                                       --out <file.zip>
                                       leaves out keys, certificates, .env and credential files, source maps, secrets
                                       (Stripe's, Toolaby's API keys, webhook secrets), git's files, a build's copy of a
                                       private file, an image that is none; refuses a build if one is a file the manifest names
                                       --allow-private  --allow-test  --allow-local  --allow-toolaby-hosts   pack them anyway

    Your tools — every one of these is also an MCP tool, and answers JSON with --json
    tools · tool get <tool>            your tools; one tool: Free plan, features, plans, key, checkout page
    tool create --name <name>          a new tool   [--id <id>] [--tagline <line>] [--workspace <slug>]
    tool update <tool>                 [--name] [--tagline] [--description] [--store-url <Chrome Web Store link>]
    access <tool> --access open|free_uses|paid    what the Free plan holds   [--free-uses N] [--free-uses-per ever|day|week|month] [--sign-in-required]
    features <tool> --features '<json>' [--plans '<json>']    the features, and which plans unlock them (or @file.json)
    plan add <tool> --billing one_time|subscription --amount 5 --currency usd   [--interval month|year] [--name Pro]
                                       [--trial-days N] [--devices N] [--per-seat | --no-per-seat]
    plan update <tool> <plan>          [--name] [--trial-days] [--devices] [--per-seat | --no-per-seat]
    plan retire <tool> <plan>          off sale; buyers keep what they bought
    customers <tool> · customer <tool> <email>    who holds it; one buyer: licences, subscription, grants, by id
    grant <tool> <email> [--days N]    access without paying; grant revoke <tool> <grant-id> takes it back
    coupon create <tool> --percent-off 100 [--code REVIEW] [--max-redemptions 1] [--expires-days 30]   e.g. a store reviewer's
    refund <tool> <email>              a lifetime licence refunded and revoked   [--licence <id>]
    cancel <tool> <email>              a subscription ended at its period's end   [--now] [--subscription <id>]
    test-unlock <tool> [--plan <id>]   Test only: a test licence, for check --browser --as <plan>
    copy-to-live <tool>                the tool from Test to Live (signed in on both: login, login --live), then upgrade --live
    stripe [--workspace <slug>]        whether Stripe is connected, and where a person connects it
    api-keys create --env-file .env    a server API key, written into the file as TOOLABY_API_KEY, never printed
    docs [page] · docs search <words>  the docs as Markdown; a search of them
    On Live, refund, cancel, plan retire and grant revoke ask you to type yes (--yes without a terminal).

    For coding agents
    agents                             Toolaby's MCP server added to Claude Code, Codex, Cursor, VS Code and Gemini here
                                       --client <name,…>   --project (the project's .mcp.json and friends)   --live
    mcp                                the MCP server itself, on stdio (what agents registers)
    login --no-wait --json             a sign-in link and code for a person, at once; login --poll <deviceCode> waits for it

    webhooks events                    the nine events and what each means
    webhooks trigger <event>           an example delivery to your endpoints; --to <url> sends it to a local server instead,
                                       signed with this machine's development secret, or with --secret <whsec_…>
    webhooks secret                    this machine's development secret, for the local server's TOOLABY_WEBHOOK_SECRET
    webhooks endpoints                 your endpoints; add <url> registers one (secret shown once), remove <id> removes one
                                       add takes --description <text> and --events a.b,c.d
                                       --workspace <slug>   which of your workspaces, when you have several (trigger, endpoints, add, remove)
    login · whoami · logout            the session, per side; a command that needs one signs you in itself
    --version · --help                 this command's version; this help

    Every command acts on Test (toolaby.app/test) unless told --live (toolaby.app).
    --server <url> or TOOLABY_SERVER gives Toolaby another address (a server on this machine, say);
    TOOLABY_TOKEN a session, for CI — sent to Live alone, or to the one address TOOLABY_TOKEN_SERVER names
    (https://toolaby.app/test for Test).

    In a repository you did not write, install it (npm i -g toolaby) and type toolaby-cli: npx can run a toolaby
    the project carries, or fetch one from a registry its .npmrc names.
`);
}

// whoami and tools speak to a person as before, and answer as the operation with --json; every other operation's words
// (tool get, plan add, customers, refund…) go to runOp.
const asOp = () => runOp(wordsOf(argv));
const commands = { login: loginCommand, logout, whoami: () => (flag('--json') ? asOp() : whoami()), tools: () => (flag('--json') ? asOp() : tools()), wire, upgrade: wire, create, webhooks, pack, check, mcp, agents, help, '--help': help, '-h': help, '--version': () => out(VERSION), '-v': () => out(VERSION) };
const run = commands[command] ?? (opForWords(opsFor(side), wordsOf(argv)) ? asOp : null);
if (!run) { console.error(`\n  Unknown command "${command}".`); help(); process.exit(1); }
Promise.resolve().then(run).then(async () => {
  if (command === 'mcp') return;
  const newer = await newerToolaby();
  if (newer) console.error(`\n  ${yellow('↑')} toolaby ${newer} is out; this is ${VERSION}. Run it as npx -y toolaby@latest, or update the Toolaby plugin.\n`);
}).catch((e) => fail(oneLine(e.message)));
