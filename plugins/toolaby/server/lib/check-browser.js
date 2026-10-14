// `check --browser`: the extension loaded in Chromium, its background asked a question the way Toolaby's client asks
// it — over the client's own line, chrome.runtime.connect({ name: 'toolaby' }), which only Toolaby's background
// answers (packages/extension-client/src/unanswered.js, background.js) — and its own pages opened, each watched for an
// error. Asked on the shared channel, chrome.runtime.sendMessage, a listener of the extension's own that answers every
// message answered for a background with no Toolaby in it (Unsubscriby's, 1 Oct 2026).
//
// Playwright comes from wherever it already is — TOOLABY_PLAYWRIGHT, the project's own, or this command's cache — and
// otherwise is installed into that cache, under the command's config folder: never into the developer's extension.
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { oneLine } from './safe.js';

/** The Playwright this command installs when none is at hand: one version, so every machine checks alike. */
export const PLAYWRIGHT_VERSION = '1.63.0';
/** What it downloads the first time, said before it starts. */
export const DOWNLOAD_SIZES = { playwright: 'about 10 MB', chromium: 'about 170 MB' };
/** How long the background has to answer, and each page to open. */
const ANSWER_MS = 8_000;
const PAGE_MS = 1_500;

/** The cache Playwright is installed into: beside the command's session, never in a project. */
export const playwrightCache = (dir) => join(dir, 'playwright');

const isPlaywright = (dir) => { try { return ['playwright', 'playwright-core'].includes(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name); } catch { return false; } };

/**
 * Where Playwright already is, or null: TOOLABY_PLAYWRIGHT (its package folder), the project's own (what the project
 * resolves `playwright` to), then this command's cache. Nothing is installed here.
 */
export function findPlaywright({ folder, cache, env = process.env }) {
  const named = env.TOOLABY_PLAYWRIGHT;
  if (named) {
    const dir = isAbsolute(named) ? named : resolve(named);
    if (!isPlaywright(dir)) return { why: `TOOLABY_PLAYWRIGHT names ${dir}, which is not a Playwright package folder.` };
    try { return { entry: createRequire(join(dir, 'package.json')).resolve(dir), from: `TOOLABY_PLAYWRIGHT (${dir})` }; } catch { return { why: `TOOLABY_PLAYWRIGHT names ${dir}, whose entry could not be found.` }; }
  }
  for (const [base, from] of [[folder, 'the project'], [cache, `this command's cache (${cache})`]]) {
    if (!base) continue;
    try { return { entry: createRequire(join(base, 'package.json')).resolve('playwright'), from }; } catch { /* not there */ }
  }
  return null;
}

/**
 * A command run to its end without holding the process — the MCP server answers other calls meanwhile — its output on
 * standard error, never standard output, which `--json` and the MCP server keep for their answer. Answers its status.
 */
function run(cmd, args, opts) {
  return new Promise((done) => {
    let child;
    try { child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { done({ status: null, error: e }); return; }
    child.stdout.on('data', (d) => process.stderr.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('error', (error) => done({ status: null, error }));
    child.on('close', (status) => done({ status }));
  });
}

/** npm, run by the Node that runs this command: the one npx used (npm_execpath), else the one beside Node. */
function npm(args, opts) {
  const cli = opts.env?.npm_execpath && /npm-cli\.js$/.test(opts.env.npm_execpath) ? opts.env.npm_execpath : null;
  if (cli) return run(process.execPath, [cli, ...args], opts);
  return run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { ...opts, shell: process.platform === 'win32' });
}

/**
 * Playwright's chromium, ready to launch: found, or installed into the cache, and its Chromium downloaded when it is
 * not there yet. Progress goes to `log` — standard error — never to standard output, which `--json` and the MCP server
 * keep for their answer. Answers { chromium, from, version } or { why }.
 */
export async function preparePlaywright({ folder, cache, env = process.env, log = (s) => process.stderr.write(`${s}\n`) }) {
  let found = findPlaywright({ folder, cache, env });
  if (found?.why) return { why: found.why };
  if (!found) {
    log(`  --browser needs Playwright ${PLAYWRIGHT_VERSION} (${DOWNLOAD_SIZES.playwright}) and its Chromium (${DOWNLOAD_SIZES.chromium}): downloaded once into ${cache}, never into your extension's folder.`);
    try {
      mkdirSync(cache, { recursive: true });
      if (!existsSync(join(cache, 'package.json'))) writeFileSync(join(cache, 'package.json'), '{ "private": true, "description": "Playwright for toolaby check --browser" }\n');
    } catch (e) { return { why: `${cache} could not be made: ${oneLine(e.message)}` }; }
    const r = await npm(['install', '--no-audit', '--no-fund', '--no-save', '--no-package-lock', '--prefix', cache, `playwright@${PLAYWRIGHT_VERSION}`], { cwd: cache, env });
    if (r.status !== 0) return { why: `Installing Playwright ${PLAYWRIGHT_VERSION} into ${cache} failed${r.error ? ` (${oneLine(r.error.message)})` : ''}. Install it yourself there with \`npm install --prefix ${cache} playwright@${PLAYWRIGHT_VERSION}\`, or name an installed one with TOOLABY_PLAYWRIGHT=<its folder>.` };
    found = findPlaywright({ folder: null, cache, env: { ...env, TOOLABY_PLAYWRIGHT: '' } });
    if (!found || found.why) return { why: `Playwright was installed into ${cache} but cannot be loaded from there.` };
  }
  let pw;
  try { pw = await import(pathToFileURL(found.entry).href); } catch (e) { return { why: `Playwright (${found.from}) could not be loaded: ${oneLine(e.message)}` }; }
  const chromium = pw.chromium ?? pw.default?.chromium;
  if (!chromium) return { why: `Playwright (${found.from}) has no chromium.` };
  const pkgDir = (() => { for (let d = dirname(found.entry), i = 0; i < 4; d = dirname(d), i++) if (isPlaywright(d)) return d; return null; })();
  const version = pkgDir ? JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version : null;
  let executable = null;
  try { executable = chromium.executablePath(); } catch { /* not known: downloaded below */ }
  if (!executable || !existsSync(executable)) {
    const cli = pkgDir && existsSync(join(pkgDir, 'cli.js')) ? join(pkgDir, 'cli.js') : null;
    if (!cli) return { why: `Playwright's Chromium is not downloaded, and Playwright (${found.from}) has no command to download it: \`npx -y playwright@${version ?? PLAYWRIGHT_VERSION} install chromium\`.` };
    log(`  Downloading Chromium for Playwright ${version ?? ''} (${DOWNLOAD_SIZES.chromium}), once: later checks reuse it.`);
    const r = await run(process.execPath, [cli, 'install', '--no-shell', 'chromium'], { env });
    if (r.status !== 0) return { why: `Downloading Chromium failed: \`npx -y playwright@${version ?? PLAYWRIGHT_VERSION} install chromium\` does it by hand.` };
  }
  return { chromium, from: found.from, version };
}

/** An unpacked extension's id from its manifest's `key`, as Chrome makes it. */
export function idFromKey(key) {
  try {
    const hex = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
    return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  } catch { return null; }
}

/**
 * The built extension in `built`, loaded and asked. Each result goes to `add(level, code, message, extra)`.
 * `slug` is the tool the key names, which the background's answer must name too.
 */
export async function browserCheck({ built, manifest, slug, folder, cache, env, log, add, docs, rel, licence = null }) {
  const ready = await preparePlaywright({ folder, cache, env, log });
  if (ready.why) { add('error', 'BROWSER_UNAVAILABLE', `--browser could not run: ${ready.why}`, { docs: docs('cli#check-folder') }); return; }
  let ctx;
  try {
    ctx = await ready.chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${built}`, `--load-extension=${built}`] });
  } catch (e) {
    add('error', 'BROWSER_UNAVAILABLE', `Chromium did not start (Playwright ${ready.version ?? ''}, ${ready.from}): ${oneLine(e.message)}`, { docs: docs('cli#check-folder') });
    return;
  }
  try {
    const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null));
    const id = worker ? new URL(worker.url()).host : typeof manifest?.key === 'string' ? idFromKey(manifest.key) : null;
    if (!worker) add('error', 'BACKGROUND_NOT_STARTED', "No service worker started within 15 seconds: the manifest names none, or Chrome refused it. Open chrome://extensions → the extension → Errors.", { file: 'manifest.json', docs: docs('troubleshooting#in-the-extension') });
    else add('ok', 'BROWSER_LOADED', `Loaded in Chromium as ${id} (${rel}), with Playwright ${ready.version ?? ''} from ${ready.from}.`);
    if (!id) return;
    if (worker) {
      // A page of the extension with nothing of its own running: the manifest, which Chrome shows as text.
      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${id}/manifest.json`).catch(() => {});
      const asked = await page.evaluate((ms) => new Promise((done) => {
        let port;
        try { port = chrome.runtime.connect({ name: 'toolaby' }); } catch (e) { done({ error: String(e?.message ?? e) }); return; }
        const timer = setTimeout(() => { try { port.disconnect(); } catch { /* gone */ } done({ timeout: true }); }, ms);
        port.onMessage.addListener((m) => { if (m?.id !== 1) return; clearTimeout(timer); try { port.disconnect(); } catch { /* gone */ } done({ answer: m.answer ?? null }); });
        port.onDisconnect.addListener(() => { clearTimeout(timer); done({ closed: chrome.runtime.lastError?.message || 'The background closed the line.' }); });
        port.postMessage({ id: 1, message: { action: 'toolaby.config' } });
      }), ANSWER_MS).catch((e) => ({ error: String(e?.message ?? e) }));
      await page.close().catch(() => {});
      const named = asked.answer && typeof asked.answer === 'object' ? asked.answer : null;
      if (named && typeof named.slug === 'string') {
        if (slug && named.slug !== slug) add('error', 'BACKGROUND_KEY_DIFFERS', `The background answers for ${oneLine(named.slug)}, and the key names ${oneLine(slug)}: the build is older than toolaby.config.js. Build again, then reload.`, { docs: docs('troubleshooting#in-the-extension') });
        else add('ok', 'BACKGROUND_ANSWERS', `The background answers Toolaby's client on its own line, for ${oneLine(named.slug)}${named.mode ? ` on ${named.mode === 'live' ? 'Live' : named.mode === 'test' ? 'Test' : 'a development server'}` : ''}.`);
      } else {
        const why = asked.timeout ? `nothing answered on Toolaby's line within ${ANSWER_MS / 1000} seconds: the background's code threw while loading, or never starts Toolaby` : asked.closed ? `${oneLine(asked.closed)}: nothing in the background listens on Toolaby's line, so it never starts Toolaby` : asked.error ? oneLine(asked.error) : `it answered ${oneLine(JSON.stringify(asked.answer))}, which is not Toolaby's answer`;
        add('error', 'BACKGROUND_NOT_STARTED', `The background did not answer Toolaby's client: ${why}. Open chrome://extensions → the extension → Errors, or Service worker for its console.`, { file: typeof manifest?.background?.service_worker === 'string' ? manifest.background.service_worker : 'manifest.json', docs: docs('troubleshooting#in-the-extension') });
      }
    }
    // --as <plan>: the test licence entered as a buyer would type it, then each of the plan's features asked for — on the
    // extension's own page, over the client's own line, as its popup would.
    if (licence && worker) {
      const page = await ctx.newPage();
      await page.goto(`chrome-extension://${id}/manifest.json`).catch(() => {});
      const said = await page.evaluate(({ key, features, ms }) => new Promise((done) => {
        let port;
        try { port = chrome.runtime.connect({ name: 'toolaby' }); } catch (e) { done({ error: String(e?.message ?? e) }); return; }
        const answers = new Map();
        let next = 1;
        const ask = (message) => new Promise((ok) => { const n = next++; answers.set(n, ok); port.postMessage({ id: n, message }); });
        port.onMessage.addListener((m) => { const ok = answers.get(m?.id); if (ok) { answers.delete(m.id); ok(m.answer ?? m.error ?? null); } });
        const timer = setTimeout(() => done({ timeout: true }), ms);
        (async () => {
          const activated = await ask({ action: 'toolaby.activateLicense', licenseKey: key });
          const has = {};
          for (const f of features) has[f] = await ask({ action: 'toolaby.has', feature: f });
          const user = await ask({ action: 'toolaby.getUser' });
          clearTimeout(timer);
          try { port.disconnect(); } catch { /* gone */ }
          done({ activated, has, paid: !!(user && (user.paid || user.isPremium)) });
        })().catch((e) => { clearTimeout(timer); done({ error: String(e?.message ?? e) }); });
      }), { key: licence.key, features: licence.features ?? [], ms: ANSWER_MS * 4 }).catch((e) => ({ error: String(e?.message ?? e) }));
      await page.close().catch(() => {});
      const valid = said.activated && (said.activated.valid === true || said.activated.ok === true);
      const locked = Object.entries(said.has ?? {}).filter(([, v]) => v !== true && v?.has !== true && v?.allowed !== true).map(([k]) => k);
      if (said.timeout || said.error) add('error', 'UNLOCK_FAILED', `The extension did not answer the test licence for ${oneLine(licence.plan)}: ${said.timeout ? 'no answer in time' : oneLine(said.error)}.`, { docs: docs('agents') });
      else if (!valid) add('error', 'UNLOCK_FAILED', `The test licence for ${oneLine(licence.plan)} was refused: ${oneLine(said.activated?.error ?? said.activated?.message ?? JSON.stringify(said.activated))}. The key may be for another tool or side, or held by the workspace's limit of passes.`, { docs: docs('agents') });
      else if (locked.length) add('error', 'UNLOCK_FAILED', `Entered, but ${locked.map((k) => `"${oneLine(k)}"`).join(', ')} stayed locked for ${oneLine(licence.plan)}: the plan does not unlock ${locked.length > 1 ? 'them' : 'it'} (set it with toolaby_set_features), or the code gates a key the tool does not have.`, { docs: docs('pricing') });
      else add('ok', 'UNLOCK_OK', `The test licence for ${oneLine(licence.plan)} unlocked ${licence.features?.length ? (licence.features ?? []).map((k) => `"${oneLine(k)}"`).join(', ') : 'the tool'} in the loaded extension${said.paid ? '; it reads as paid' : ''}.`);
    }
    // The extension's own pages, each in a tab: one whose script throws is a popup that opens blank.
    const own = [manifest?.action?.default_popup, manifest?.side_panel?.default_path, manifest?.options_ui?.page ?? manifest?.options_page].filter((p, i, all) => typeof p === 'string' && p && all.indexOf(p) === i);
    for (const p of own) {
      const tab = await ctx.newPage();
      const errors = [];
      tab.on('pageerror', (e) => errors.push(e.message));
      await tab.goto(`chrome-extension://${id}/${p.replace(/^\/+/, '')}`).catch((e) => errors.push(e.message));
      await tab.waitForTimeout(PAGE_MS);
      await tab.close().catch(() => {});
      if (errors.length) {
        const module = errors.find((e) => /import statement outside a module|Unexpected token 'export'/i.test(e));
        add('error', module ? 'POPUP_NOT_MODULE' : 'PAGE_THREW', `${oneLine(p)} threw when it opened: ${oneLine(errors[0])}${module ? `. A script with import or export lines loads only with type="module": <script type="module" src="…">.` : ''}`, { file: p, docs: docs(module ? 'troubleshooting#in-the-extension' : 'cli#check-folder') });
      } else add('ok', 'PAGE_OPENS', `${oneLine(p)} opens without an error.`, { file: p });
    }
  } finally {
    await ctx.close().catch(() => {});
  }
}
