// `toolaby check`: whether the extension in a folder is wired right, as findings an agent can act on — each with a code
// that never changes, a level, the file it is about, the command that fixes it and the page that explains it. The
// files Toolaby writes, the tool key and the tool it names, the manifest against the platform's own wiring rules, the
// background, the pages' scripts, the client's freshness, the feature keys the code gates on against the tool's,
// whether anything can ever ask anyone to pay, whether a copy has checked in and whether the key is current — on the
// side the KEY is on — and this command's own version. With a build (--built <dir>, or a build's folder named itself):
// the built manifest and the bundle, wherever the bundler put Toolaby. With --browser: the extension loaded in
// Chromium, its background asked over Toolaby's own line, and its pages opened (lib/check-browser.js).
//
// runCheck() prints nothing: it answers { ok, side, findings }, which the command prints (bin.mjs) or hands over as
// JSON (--json), and the MCP server returns as it is.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { oneLine, keySite, fetchBounded, readText } from './safe.js';
import { wrappedBy, namedWorker, startsPlatform as startsWall, sitePattern, parseManifest, notManifestV3, wireManifest, WALL_POPUP, WALL_SIDE_PANEL } from './manifest.js';
import { detectProject } from './project.js';
import { popupSwapIn, ownCode } from './summary.js';
import { decodeKey, filesOf, keysIn, isBuildOutput, isStoreBuild, classicModules, workerCode, carriesClient, projectAbove } from './check-bundle.js';
import { testLicenceFor } from './test-licences.js';
import { configDir, ownVersion, wallForKey, sideOf, sessionFor, wallApi, servedVersion, olderThan, WALLS } from './check-server.js';
import { browserCheck, playwrightCache } from './check-browser.js';

const KEY = /tk_(test|live|dev)_[A-Za-z0-9_-]{20,}/;
/** A tool id as Toolaby makes them (lib/mcp.js has the same): the only thing the check puts after a Toolaby server's address. */
const TOOL_ID = /^[a-z0-9][a-z0-9-]{1,118}$/;
const CODE = /\.(m?js|jsx|ts|tsx|html|vue|svelte)$/;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.output', '.wxt', '.plasmo', '.next', 'coverage']);
/** Where a framework's or a bundler's build lands, in the order --browser and the hints look. */
const BUILD_DIRS = ['.output/chrome-mv3', 'dist', 'build/chrome-mv3-dev', 'build/chrome-mv3-prod', 'build'];
const sha = (s) => createHash('sha256').update(s).digest('hex');
const DOCS = 'https://toolaby.app/docs';
const docs = (page) => `${DOCS}/${page}`;

/**
 * Every finding `check` can make that asks for something: its code, its level, and what it means. The codes never
 * change; the docs list each (toolaby.app/docs/cli), and a test holds the two together.
 */
export const CHECK_CODES = {
  FOLDER_MISSING: ['error', 'The folder does not exist.'],
  MANIFEST_INVALID: ['error', '`manifest.json` is not JSON, with or without comments.'],
  NOT_MANIFEST_V3: ['error', 'The manifest is not Manifest V3, the only kind Chrome runs.'],
  NOT_AN_EXTENSION: ['error', 'No `manifest.json` at the top, and not a WXT, CRXJS or Plasmo project.'],
  FILES_MISSING: ['error', '`toolaby.js` or `toolaby.config.js` is missing: the folder is not wired.'],
  NO_TOOL_KEY: ['error', '`toolaby.config.js` holds no tool key.'],
  KEY_NOT_TOOLABY: ['error', "The key names an address that is not Toolaby's, or a tool id no tool has. Nothing is asked of it."],
  TOOLABY_UNREACHABLE: ['error', 'Toolaby could not be reached at the address the key names.'],
  TOOL_NOT_FOUND: ['error', 'Toolaby does not sell the tool the key names: deleted, switched off, or on the other side.'],
  STORAGE_MISSING: ['error', 'The manifest has no `storage` permission.'],
  EXTERNALLY_CONNECTABLE_MISSING: ['error', "Toolaby's address is not under `externally_connectable`: sign-in and the purchase never reach the extension."],
  CSP_BLOCKS_TOOLABY: ['error', "The content security policy's `connect-src` (or `default-src`) leaves Toolaby's address out: every call of Toolaby's fails to fetch."],
  BACKGROUND_NOT_STARTED: ['error', 'Nothing starts Toolaby in the background: none is named, it never starts Toolaby, a build\'s carries none of it, or it did not answer Toolaby\'s client (`--browser`).'],
  BACKGROUND_KEY_DIFFERS: ['error', 'The background starts Toolaby with another key than `toolaby.config.js`.'],
  POPUP_NOT_MODULE: ['error', 'A page loads a script with `import` or `export` lines without `type="module"`: Chrome refuses it and the page opens blank.'],
  TEST_KEY_IN_LIVE_BUILD: ['error or warn', 'A store copy (its manifest has `update_url`) carries a Test or development key: an error. A production build that carries one: a warning.'],
  FEATURE_KEY_UNKNOWN: ['error', 'The code gates on a feature key the tool does not have: every buyer is refused.'],
  NO_PAYWALL_POSSIBLE: ['error or warn', 'Nothing in the extension can ever ask anyone to pay. An error when the tool sells plans; a warning when it has none.'],
  BUILT_MISSING: ['error', 'The build named with `--built` has no `manifest.json`.'],
  BUILT_KEY_MISSING: ['error', 'The build carries no tool key: it leaves `toolaby.config.js` out, or it was not wired.'],
  BUILT_FILE_MISSING: ['error', 'The built manifest names a background, popup or side panel the build does not have.'],
  NOTHING_BUILT: ['error', '`--browser` found no built extension to load.'],
  BROWSER_UNAVAILABLE: ['error', '`--browser` could not get Playwright or start Chromium.'],
  PAGE_THREW: ['error', 'A page of the extension threw when it opened (`--browser`).'],
  UNLOCK_OK: ['ok', "The test licence `--as <plan>` names was entered in the loaded extension, and each of the plan's features unlocked."],
  UNLOCK_FAILED: ['error', "The test licence `--as <plan>` names did not unlock the plan's features in the loaded extension."],
  TEST_LICENCE_MISSING: ['error', '`--as <plan>` names a plan with no test licence: run `test-unlock <tool> --plan <plan>` first (Test only).'],
  HOST_PERMISSION_LEFT: ['warn', "The manifest gives Toolaby's address, or another side's Test address, a host permission or an entry Toolaby does not need."],
  MANIFEST_KEY_MISSING: ['warn', 'The manifest has no `key`: each copy\'s id depends on its folder.'],
  STORE_STEPS: ['ok', 'A Test or development key: the exact commands that put the Live key in for the store build, with this tool\'s id.'],
  KEY_OUTDATED: ['warn', "The tool key is older than Toolaby's: the Free plan, the plans or the signing key changed since it was written."],
  BUILT_KEY_DIFFERS: ['warn', 'The build carries another tool key than `toolaby.config.js`: it was built before the key changed.'],
  BUILT_NOT_CHECKED: ['warn', 'A framework generates the manifest: the built one was not checked.'],
  POPUP_SWAPPED: ['warn', 'Your code handles the popup itself (`setPopup()` or `getPopup()`).'],
  CLIENT_OUTDATED: ['warn', "`toolaby.js` is not Toolaby's current client."],
  CLIENT_UNREADABLE: ['warn', "Toolaby's current client could not be read to compare."],
  PAYWALL_PAGE_MISSING: ['warn', 'The code calls `showPaywall()`, and the page it opens is not in the extension.'],
  FEATURE_NOT_SOLD: ['warn', 'The code gates on a feature no plan unlocks.'],
  FEATURE_ARCHIVED: ['warn', 'The code gates on an archived feature: whoever holds it keeps it, and the checkout no longer lists it.'],
  NO_PLAN: ['warn', 'The Free plan does not hold everything, and there is no plan to buy.'],
  NOT_CHECKED_IN: ['warn', 'No copy of the extension has checked in yet.'],
  NOT_SIGNED_IN: ['warn', 'No session on the side the key is on: the checks that need one were not made.'],
  TOOL_NOT_YOURS: ['warn', 'The tool is not in the workspaces of the account signed in on that side.'],
  CLI_OUTDATED: ['warn', 'This command is older than the one Toolaby serves.'],
};

/**
 * The code without its comments: an example in a comment (the scaffold's background has one) is not a gate. Strings
 * are kept whole, so a `//` inside one is not taken for a comment.
 */
export function withoutComments(text) {
  return text.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->/g, (m, str) => (str ? m : ''));
}

/** Feature keys the code asks about: gate({ feature: 'x' }), has('x') and showPaywall({ feature: 'x' }), outside comments. */
export function featuresUsed(source, { bundle = false } = {}) {
  const text = withoutComments(source);
  const keys = new Set();
  for (const m of text.matchAll(/gate\(\s*\{[^}]*?feature\s*:\s*['"`]([a-z0-9][a-z0-9-]*)['"`]/g)) keys.add(m[1]);
  // In a bundle, has('…') is every library's Set and Map: only the source's is read.
  if (!bundle) for (const m of text.matchAll(/\.has\(\s*['"`]([a-z0-9][a-z0-9-]*)['"`]\s*\)/g)) keys.add(m[1]);
  for (const m of text.matchAll(/showPaywall\(\s*\{[^}]*?feature\s*:\s*['"`]([a-z0-9][a-z0-9-]*)['"`]/g)) keys.add(m[1]);
  return keys;
}

/** The extension's own source files, not Toolaby's and not a build's. */
function sourceFiles(dir, acc = [], depth = 4) {
  let names; try { names = readdirSync(dir); } catch { return acc; }
  for (const name of names) {
    if (SKIP.has(name) || name.startsWith('.')) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (depth > 0) sourceFiles(p, acc, depth - 1); continue; }
    if (CODE.test(name) && !name.startsWith('toolaby')) acc.push(p);
  }
  return acc;
}

/** What is in a folder, a few levels down, as paths from it (bin.mjs lists a folder the same way for `wire`). */
function listTree(dir, depth, prefix = '', acc = new Set()) {
  let names; try { names = readdirSync(dir); } catch { return acc; }
  for (const name of names) {
    const path = `${prefix}${name}`;
    acc.add(path);
    let isDir = false;
    try { isDir = statSync(join(dir, name)).isDirectory(); } catch { /* gone */ }
    if (isDir && depth > 0 && !SKIP.has(name)) listTree(join(dir, name), depth - 1, `${path}/`, acc);
  }
  return acc;
}

const readOr = (p, none = null) => { try { return readText(p); } catch { return none; } };
const readJson = (p) => { try { return JSON.parse(readText(p)); } catch { return null; } };
function jsonOf(body) { try { return body ? JSON.parse(body.toString('utf8')) : null; } catch { return null; } }
/** A shell word, quoted where it must be. */
const shellWord = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`);

/** Whether a manifest's match patterns already reach Toolaby's address, a wildcard host included. */
function covers(patterns, site) {
  let u; try { u = new URL(site); } catch { return false; }
  return (patterns ?? []).some((p) => {
    if (typeof p !== 'string') return false;
    if (p === '<all_urls>' || p === `${u.origin}/*`) return true;
    const m = /^(\*|https?):\/\/(\*|\*\.[^/]+|[^/]+)\/\*$/.exec(p);
    if (!m) return false;
    const [, scheme, host] = m;
    return (scheme === '*' || scheme === u.protocol.slice(0, -1)) && (host === '*' || host === u.host || (host.startsWith('*.') && (u.host === host.slice(2) || u.host.endsWith(host.slice(1)))));
  });
}

/** Whether a manifest stands Toolaby's popup or side panel in front: the page that shows the paywall when a device may not use. */
const toolabyInFront = (m) => m?.action?.default_popup === WALL_POPUP || m?.side_panel?.default_path === WALL_SIDE_PANEL || m?.sidebar_action?.default_panel === WALL_SIDE_PANEL;

/**
 * Checks the extension in `folder`. Options: `side` and `wall`, the side the caller acts on and its address; `api`, a
 * request to that Toolaby server with its session ({ status, ok, json }); `token`, a function answering that session or null;
 * `built`, a build's folder; `browser`, to load it in Chromium; `onFinding`, called with each finding as it is made;
 * `log`, where --browser says what it downloads (standard error by default). Prints nothing. Answers
 * { ok, side, folder, built, findings }: ok is false when a finding is an error.
 */
export async function runCheck(o = {}) {
  const env = o.env ?? process.env;
  const version = o.version ?? ownVersion();
  const callerWall = o.wall ? String(o.wall).replace(/\/+$/, '') : null;
  const log = o.log ?? ((s) => process.stderr.write(`${s}\n`));
  const findings = [];
  const add = (level, code, message, extra = {}) => {
    const f = { code, level, message };
    for (const k of ['file', 'line', 'fix', 'docs']) if (extra[k] !== undefined && extra[k] !== null) f[k] = extra[k];
    findings.push(f);
    try { o.onFinding?.(f); } catch { /* a printer's trouble is not the check's */ }
    return f;
  };
  const dir = resolve(o.folder ?? '.');
  let side = o.side ?? null;
  let builtDir = null;
  const done = () => ({ ok: !findings.some((f) => f.level === 'error'), side, folder: dir, built: builtDir, findings });
  // Paths in messages as the developer typed them, from where the command runs; in `file`, from the folder checked
  // (result.folder); in a command to run, absolute when the folder was given so (the MCP server, an agent elsewhere).
  const rel = (p) => { const r = relative(process.cwd(), p); return r.startsWith('..') || isAbsolute(r) ? p : r || '.'; };
  const fileOf = (p) => relative(dir, p).split(sep).join('/') || '.';
  const cmdPath = (p) => shellWord(isAbsolute(o.folder ?? '.') ? p : rel(p));

  // 1. What the folder is.
  if (!existsSync(dir)) { add('error', 'FOLDER_MISSING', `${dir} does not exist.`); return done(); }
  const tree = listTree(dir, 3);
  const has = (p) => tree.has(p.replace(/\/$/, ''));
  // As Chrome reads it (comments allowed), and only a Manifest V3 extension: Chrome runs no other.
  const manifest = has('manifest.json') ? parseManifest(readOr(join(dir, 'manifest.json'), '')).manifest : null;
  if (has('manifest.json') && !manifest) { add('error', 'MANIFEST_INVALID', 'manifest.json is not valid JSON.', { file: 'manifest.json' }); return done(); }
  if (manifest && notManifestV3(manifest)) { add('error', 'NOT_MANIFEST_V3', notManifestV3(manifest), { file: 'manifest.json', docs: 'https://developer.chrome.com/docs/extensions/develop/migrate' }); return done(); }

  // A build: named with --built, or the folder is one — a framework's output (.output/…, dist, build), or a folder whose
  // bundle carries a key without Toolaby's files beside it. Its project is the nearest folder above with a package.json.
  if (o.built) builtDir = [resolve(dir, o.built), resolve(o.built)].find((d) => existsSync(join(d, 'manifest.json'))) ?? resolve(dir, o.built);
  else if (manifest && (isBuildOutput(dir) || (!has('toolaby.config.js') && !has('toolaby.js') && keysIn(dir, filesOf(dir, { depth: 4, max: 800 })).size))) builtDir = dir;
  const projectDir = builtDir === dir ? projectAbove(dir, existsSync) : dir;

  // 2. The project: its kind, Toolaby's files, the key in toolaby.config.js.
  let project = null; let projectManifest = null; let configText = ''; let configKeyText = null;
  const pdHas = projectDir === dir ? has : (() => { const t = projectDir ? listTree(projectDir, 3) : new Set(); return (p) => t.has(p.replace(/\/$/, '')); })();
  if (projectDir) {
    const read = projectDir === dir ? { manifest } : pdHas('manifest.json') ? parseManifest(readOr(join(projectDir, 'manifest.json'), '')) : { manifest: null };
    projectManifest = read.manifest && !notManifestV3(read.manifest) ? read.manifest : null;
    const configSource = ['manifest.config.ts', 'manifest.config.js', 'manifest.ts', 'src/manifest.ts'].find(pdHas);
    const found = detectProject({ has: pdHas, packageJson: pdHas('package.json') ? readJson(join(projectDir, 'package.json')) : null, manifest: projectManifest, manifestSource: configSource ? readOr(join(projectDir, configSource)) : null, site: 'https://example.invalid', tree: projectDir === dir ? tree : new Set() });
    if (found.kind === 'unknown') {
      if (!builtDir) { add('error', 'NOT_AN_EXTENSION', `Not an extension project: no manifest.json at the top, and not WXT, CRXJS or Plasmo${found.foundManifest ? ` (there is a manifest at ${oneLine(found.foundManifest)}: run this with --into ${oneLine(found.foundManifest.replace(/\/?manifest\.json$/, '')) || '.'})` : ''}.`, { docs: docs('frameworks') }); return done(); }
    } else project = found;
  }
  if (project) {
    add('ok', 'PROJECT', `${project.kind === 'plain' ? 'A plain extension: manifest.json at the top' : `A ${project.label} project`}${projectDir !== dir ? `, in ${rel(projectDir) === '.' ? 'the folder this runs in' : rel(projectDir)}` : ''}.`);
    const at = (f) => join(projectDir, `${project.codeDir}${f}`);
    const missing = ['toolaby.js', 'toolaby.config.js'].filter((f) => !existsSync(at(f)));
    if (missing.length) {
      add('error', 'FILES_MISSING', `${missing.map((f) => `${project.codeDir}${f}`).join(' and ')} missing: the folder is not wired.`, { fix: `npx -y toolaby@latest wire <tool-id>${projectDir !== process.cwd() ? ` --into ${cmdPath(projectDir)}` : ''}`, docs: docs('cli#wire-tool-id') });
      if (!builtDir) return done();
    } else {
      add('ok', 'FILES_PRESENT', `Toolaby's files are in ${project.codeDir || 'the top folder'}.`);
      // The tool key, from a file: a link to a device or a pipe is read as nothing.
      configText = readOr(at('toolaby.config.js'), '');
      configKeyText = configText.match(KEY)?.[0] ?? null;
      if (!configKeyText) {
        add('error', 'NO_TOOL_KEY', 'toolaby.config.js holds no tool key. Run `npx -y toolaby@latest upgrade <tool-id>` here.', { file: fileOf(at('toolaby.config.js')), fix: `npx -y toolaby@latest upgrade <tool-id>${projectDir !== process.cwd() ? ` --into ${cmdPath(projectDir)}` : ''}`, docs: docs('cli#upgrade-tool-id') });
        if (!builtDir) return done();
      }
    }
  }

  // 3. The build: its manifest, and the keys its bundle carries.
  let built = null;
  if (builtDir) {
    const name = rel(builtDir);
    const read = existsSync(join(builtDir, 'manifest.json')) ? parseManifest(readOr(join(builtDir, 'manifest.json'), '')) : null;
    if (!read) add('error', 'BUILT_MISSING', `No manifest.json in ${name}: build first, then check the folder the build writes.`, { docs: docs('cli#check-folder') });
    else if (!read.manifest) add('error', 'MANIFEST_INVALID', `${name}/manifest.json is not valid JSON.`, { file: fileOf(join(builtDir, 'manifest.json')) });
    else if (notManifestV3(read.manifest)) add('error', 'NOT_MANIFEST_V3', notManifestV3(read.manifest), { file: fileOf(join(builtDir, 'manifest.json')) });
    else {
      const files = filesOf(builtDir);
      built = { dir: builtDir, name, file: (f) => fileOf(join(builtDir, f)), manifest: read.manifest, files, keys: keysIn(builtDir, files) };
      add('ok', 'BUILT_FOUND', `The build in ${name}: ${files.length} files.`);
      if (!built.keys.size) add('error', 'BUILT_KEY_MISSING', `No tool key in ${name}: the build leaves toolaby.config.js out, or the project is not wired. A bundler takes it in when the code imports toolaby.js.`, { docs: docs('frameworks') });
    }
  }
  const builtKeys = built ? [...built.keys.keys()] : [];
  const keyText = configKeyText ?? builtKeys.find((k) => decodeKey(k)) ?? null;
  if (!keyText) return done();

  // 4. The key, and the tool it names.
  const key = decodeKey(keyText);
  if (!key) { add('error', 'NO_TOOL_KEY', `The tool key ${configKeyText ? 'in toolaby.config.js' : `in ${built?.name}`} cannot be read: it was cut short when it was copied.`, { fix: 'npx -y toolaby@latest upgrade <tool-id>', docs: docs('cli#upgrade-tool-id') }); return done(); }
  const mode = key.mode;
  // The fix, as the key's own side wants it: a Live key's folder told to run `upgrade` without --live got the Test key
  // written into its store build.
  const liveFlag = mode === 'live' ? ' --live' : '';
  const into = projectDir && projectDir !== process.cwd() ? ` --into ${cmdPath(projectDir)}` : '';
  const upgradeCommand = `npx -y toolaby@latest upgrade ${key.slug}${liveFlag}`;
  const upgradeFix = `${upgradeCommand}${into}`;
  const upgrade = `\`${upgradeCommand}\``;
  const keyFile = configKeyText ? fileOf(join(projectDir, `${project?.codeDir ?? ''}toolaby.config.js`)) : built.file(built.keys.get(keyText)?.[0] ?? '');
  // The key is the project's: Toolaby it names is asked twice below, with no session, and its tool id goes into a path
  // the developer's session asks of their own Toolaby server. So only a Toolaby server's address (lib/safe.js), and only a tool id. A cloned
  // project's key sent the two requests wherever it named, and a tool id of ".." made the signed-in one a request for
  // another route (25 Sep 2026).
  if (!keySite(key.site) || !TOOL_ID.test(key.slug)) {
    add('error', 'KEY_NOT_TOOLABY', `The tool key names ${JSON.stringify(key.slug)} at ${JSON.stringify(key.site)}, which is not a tool on a Toolaby server: its address is https (http only on this machine) with nothing after the host, and its id lowercase letters, digits and dashes. Nothing was asked of it. \`npx -y toolaby@latest upgrade <tool-id>${liveFlag}\` writes the tool's own key.`, { file: keyFile, fix: `npx -y toolaby@latest upgrade <tool-id>${liveFlag}${into}`, docs: docs('cli#upgrade-tool-id') });
    return done();
  }
  const keyWall = wallForKey(mode, callerWall);
  const sideName = mode === 'live' ? 'Live' : mode === 'test' ? 'Test' : 'a development server';
  side = mode === 'live' ? 'Live' : mode === 'test' ? 'Test' : (keyWall ?? 'Development');
  add('ok', 'KEY_FOUND', `The tool key names ${key.slug}, on ${sideName} (${key.site}).`, { file: keyFile });
  // The store build, with this tool's own id: an agent wiring two tools that share a short id told its person \`<tool-id>\` (2 Oct 2026).
  if (mode !== 'live') add('ok', 'STORE_STEPS', `For the Chrome Web Store this folder needs the Live key: \`npx -y toolaby@latest copy-to-live ${key.slug}\` (signed in on Live once: \`login --live\`), then \`npx -y toolaby@latest upgrade ${key.slug} --live${into}\`, build, and \`npx -y toolaby@latest pack\`.`, { docs: docs('ship') });
  const pub = await fetchBounded(`${key.site}/api/tools/${encodeURIComponent(key.slug)}`).then((r) => ({ status: r.status, json: jsonOf(r.body) })).catch(() => ({ status: 0, json: null }));
  const tool = pub.status === 200 ? pub.json : null;
  if (!tool) {
    if (pub.status === 0) add('error', 'TOOLABY_UNREACHABLE', `Toolaby at ${key.site} could not be reached.`);
    else if (pub.status === 404) add('error', 'TOOL_NOT_FOUND', `Toolaby does not sell ${key.slug}: deleted, switched off, or on the other side. \`npx -y toolaby@latest tools${liveFlag}\` lists yours.`, { file: keyFile, fix: `npx -y toolaby@latest tools${liveFlag}` });
    else add('error', 'TOOLABY_UNREACHABLE', `Toolaby answered HTTP ${pub.status} for the tool.`);
  } else {
    add('ok', 'TOOL_FOUND', `Toolaby knows it: ${oneLine(tool.name)}.`);
    const jwk = tool.publicKeyJwk ?? {};
    if (key.x && jwk.x && (key.x !== jwk.x || key.y !== jwk.y)) add('warn', 'KEY_OUTDATED', `The workspace's signing key was rotated after this key was written. Installed copies fetch the new one; ${upgrade} writes it in.`, { file: keyFile, fix: upgradeFix, docs: docs('cli#upgrade-tool-id') });
  }
  const apex = keyWall ? new URL(keyWall).host : callerWall ? new URL(callerWall).host : undefined;

  /** A manifest against what Toolaby needs: the same rules wiring writes it by (wiring/manifest). */
  const manifestChecks = (m, { file, fix, cspFix, keyAt, rebuild = false }) => {
    const adds = `${upgrade} adds it${rebuild ? '; then build again' : ''}.`;
    const again = wireManifest(m, { site: key.site, apex, has: () => true, remembered: null, rememberedSidePanel: null, manifestKey: typeof m.key === 'string' ? m.key : null, workerSource: null });
    const host = new URL(key.site).host;
    const added = new Set(again.added ?? []);
    let bad = 0;
    if (added.has('storage')) { bad++; add('error', 'STORAGE_MISSING', `${file} has no "storage" permission: nothing Toolaby keeps survives. ${fix ? adds : 'Add "permissions": ["storage"].'}`, { file, fix, docs: docs('troubleshooting#at-startup') }); }
    if (added.has(host) && !covers(m.externally_connectable?.matches, key.site)) { bad++; add('error', 'EXTERNALLY_CONNECTABLE_MISSING', `${file} lacks ${sitePattern(key.site)} under externally_connectable: sign-in and the purchase never reach the extension. ${fix ? adds : `Add "externally_connectable": { "matches": ["${sitePattern(key.site)}"] }.`}`, { file, fix, docs: docs('troubleshooting#at-startup') }); }
    if (added.has('connect-src')) { bad++; add('error', 'CSP_BLOCKS_TOOLABY', `${file}'s content security policy leaves ${new URL(key.site).origin} out of connect-src: every call of Toolaby's fails to fetch. ${cspFix}`, { file, fix: fix ?? undefined, docs: docs('troubleshooting#in-the-extension') }); }
    if (!bad) add('ok', 'MANIFEST_OK', 'The manifest has what Toolaby needs: the storage permission and its address under externally_connectable.', { file });
    const unneeded = new Set(again.unneeded ?? []);
    if (unneeded.size) add('warn', 'HOST_PERMISSION_LEFT', `The manifest still gives Toolaby's address a host permission, which Toolaby no longer needs: Chrome shows it to everyone installing, and switches off an update that adds it until each user approves it. ${upgrade} takes it out.`, { file, fix: upgradeFix, docs: docs('ship') });
    const stale = (again.did ?? []).filter((d) => /a Test address that is not this key's/.test(d));
    if (stale.length) add('warn', 'HOST_PERMISSION_LEFT', `The manifest names another side's Test address: ${stale.map((d) => oneLine(d.replace(/ taken out:.*$/, ''))).join('; ')}. A store build asks its buyers for it at install for nothing. ${upgrade} takes it out.`, { file, fix: upgradeFix, docs: docs('ship') });
    if (typeof m.key !== 'string' && keyAt) add('warn', 'MANIFEST_KEY_MISSING', keyAt, { file, fix: upgradeFix, docs: docs('troubleshooting#in-chrome') });
  };
  /** A store copy, or a production build, carrying a Test or development key. */
  const sideChecks = (m, keys, { file, store }) => {
    const sides = new Set(keys.map((k) => k.split('_')[1]));
    const notLive = [...sides].filter((s) => s !== 'live');
    if (!notLive.length) return;
    const which = notLive.map((s) => `tk_${s}_…`).join(' and ');
    const fix = `npx -y toolaby@latest upgrade ${key.slug} --live${into}`;
    if (typeof m.update_url === 'string') add('error', 'TEST_KEY_IN_LIVE_BUILD', `This is a store copy (its manifest has update_url), and it carries a ${which} key: its buyers pay on ${notLive.includes('test') ? 'Test, with test cards' : 'a development server'}, and nothing unlocks on Live. Wire the Live key, build, pack and upload again.`, { file, fix, docs: docs('ship#3-wire-the-store-build') });
    else if (store) add('warn', 'TEST_KEY_IN_LIVE_BUILD', `${store} is a production build, and it carries a ${which} key: it sells on ${notLive.includes('test') ? 'Test, with test cards' : 'a development server'}. Fine while you test; before the store, wire the Live key and build again (\`npx -y toolaby@latest pack\` refuses it).`, { file, fix, docs: docs('ship#3-wire-the-store-build') });
  };
  /** Pages that load a script with import or export lines as a classic one: Chrome refuses it, the page opens blank. */
  const moduleChecks = (root, files) => {
    for (const c of classicModules(root, files)) {
      const page = fileOf(join(root, c.page));
      add('error', 'POPUP_NOT_MODULE', `${page} loads ${c.script} as a classic script, and ${c.script} ${c.toolaby ? 'imports toolaby.js' : 'has import or export lines'}: Chrome stops it ("Cannot use import statement outside a module") and the page opens blank. Load it as a module: <script type="module" src="…">.`, { file: page, line: c.line, docs: docs('troubleshooting#in-the-extension') });
    }
  };

  // 5. The project's manifest, against the platform's own wiring rules: what wiring it again would add.
  if (project?.manifestFile && projectManifest) {
    const m = projectManifest;
    manifestChecks(m, {
      file: fileOf(join(projectDir, 'manifest.json')),
      fix: upgradeFix,
      cspFix: `${upgrade} adds it.`,
      // The identity: without the `key`, each copy's id follows its folder, and once the extension is named the tool key refuses every copy not chosen.
      keyAt: /manifestKey:\s*'[A-Za-z0-9+/]{100,}={0,2}'/.test(configText) ? `manifest.json has no "key": each copy's id then depends on its folder, and once your extension is named the tool key refuses any copy you did not choose on the Set up page. ${upgrade} adds it.` : null,
    });
    sideChecks(m, [keyText], { file: fileOf(join(projectDir, 'manifest.json')), store: null });
  } else if (project && !built) {
    const out = BUILD_DIRS.find((d) => existsSync(join(projectDir, d, 'manifest.json')));
    add('warn', 'BUILT_NOT_CHECKED', `The manifest is generated by ${project.label}: build, then check the built one${out ? `: \`npx -y toolaby@latest check --built ${out}\`` : ''}. It must have ${sitePattern(key.site)} under externally_connectable.`, { fix: `npx -y toolaby@latest check${projectDir !== process.cwd() ? ` ${cmdPath(projectDir)}` : ''} --built ${out ?? '<build folder>'}`, docs: docs('frameworks') });
    // CRXJS's manifest.config.ts with a security policy of its own: toolaby.manifest.js's cspWithToolaby() adds Toolaby to it.
    const source = ['manifest.config.ts', 'manifest.config.js', 'manifest.ts', 'src/manifest.ts'].find(pdHas);
    const text = source ? withoutComments(readOr(join(projectDir, source), '')) : '';
    if (project.kind === 'crxjs' && /extension_pages/.test(text) && /(connect|default)-src/.test(text) && !/cspWithToolaby\s*\(/.test(text) && !text.includes(new URL(key.site).origin)) add('warn', 'CSP_BLOCKS_TOOLABY', `${fileOf(join(projectDir, source))} sets a content security policy for extension_pages that does not name ${new URL(key.site).origin}: every call of Toolaby's would fail to fetch. Wrap it: extension_pages: cspWithToolaby("…"), imported from toolaby.manifest.js.`, { file: fileOf(join(projectDir, source)), docs: docs('troubleshooting#in-the-extension') });
  }

  // 6. The background starts Toolaby: the popup and every page ask it everything, so without it nothing answers.
  if (project?.manifestFile && projectManifest) {
    const m = projectManifest;
    const named = namedWorker(m) ?? '';
    const text = named && pdHas(named) ? readOr(join(projectDir, named), null) : null;
    const wraps = wrappedBy(text);
    // What wiring again would do with it, by the same rules (wiring/manifest).
    const b = wireManifest(m, { site: key.site, apex, has: pdHas, workerSource: text, built: project.built }).background;
    const not = (message, extra = {}) => add('error', 'BACKGROUND_NOT_STARTED', message, { file: fileOf(join(projectDir, named || 'manifest.json')), docs: docs('troubleshooting#in-the-extension'), ...extra });
    // A background the build makes is the build's to start Toolaby in: read below when the build is checked.
    if (b.kind === 'built') { if (!built) add('ok', 'BACKGROUND_BUILT', `Your build makes ${oneLine(named)}: \`npx -y toolaby@latest check --built <its folder>\` reads whether it carries Toolaby.`); }
    else if (!named || text === null) not(`Nothing starts Toolaby: the manifest names no background${named ? ` it can find (${oneLine(named)})` : ''}. ${upgrade} adds one.`, { fix: upgradeFix });
    else if (b.kind === 'gone') not(`${oneLine(named)} runs ${oneLine(b.wraps)}, which is no longer in the folder. Put your background's file name in manifest.json, then ${upgrade}.`);
    else if (b.kind === 'rename') not(`Toolaby can't load a file named ${JSON.stringify(oneLine(b.file))}. Rename it to ${oneLine(b.to)}, put that in manifest.json, then ${upgrade}.`);
    else if (b.kind === 'lines') not(`${oneLine(b.file)} never starts Toolaby, so the popup cannot reach it. Add at its top: ${oneLine(project.workerLines.trim().replace(/\n+/g, ' '))}`, { file: fileOf(join(projectDir, b.file)) });
    else if (wraps) {
      // A classic one carries the key it starts with: the one in toolaby.config.js, or the background starts with an old one.
      const carried = text.match(/"key":"([^"]+)"/)?.[1];
      if (carried && carried !== keyText) add('error', 'BACKGROUND_KEY_DIFFERS', `${oneLine(named)} starts Toolaby with another key than toolaby.config.js. ${upgrade} writes both again.`, { file: fileOf(join(projectDir, named)), fix: upgradeFix, docs: docs('cli#upgrade-tool-id') });
      else add('ok', 'BACKGROUND_STARTS', `The background starts Toolaby, and runs yours (${oneLine(wraps)}).`, { file: fileOf(join(projectDir, named)) });
    } else if (startsWall(text)) add('ok', 'BACKGROUND_STARTS', `The background (${oneLine(named)}) starts Toolaby.`, { file: fileOf(join(projectDir, named)) });
    else not(`${oneLine(named)} never starts Toolaby, so the popup cannot reach it. ${upgrade} puts Toolaby's in front of it; yours stays as it is.`, { fix: upgradeFix });
  } else if (project?.worker && !project.extraFiles) {
    if (startsWall(readOr(join(projectDir, project.worker), ''))) add('ok', 'BACKGROUND_STARTS', `The background (${oneLine(project.worker)}) starts Toolaby.`, { file: fileOf(join(projectDir, project.worker)) });
    else add('error', 'BACKGROUND_NOT_STARTED', `${oneLine(project.worker)} never starts Toolaby, so the popup cannot reach it. Add at its top: ${oneLine(project.workerLines.trim().replace(/\n+/g, ' '))}`, { file: fileOf(join(projectDir, project.worker)), docs: docs('frameworks') });
  }
  // A popup the code swaps while it runs: Toolaby's in front of it can be skipped.
  if (project?.manifestFile && projectManifest?.action?.default_popup === WALL_POPUP) {
    const swap = popupSwapIn(sourceFiles(projectDir).map((f) => relative(projectDir, f).split('\\').join('/')).filter(ownCode).map((path) => ({ path, text: readOr(join(projectDir, path), '') })));
    if (swap) add('warn', 'POPUP_SWAPPED', `Your code handles the popup itself (${oneLine(swap.call)} in ${oneLine(swap.file)}): \`${upgradeCommand} --own-popup\` keeps yours in front.`, { file: fileOf(join(projectDir, swap.file)), fix: `${upgradeFix} --own-popup`, docs: docs('troubleshooting#in-the-extension') });
  }
  // The pages' scripts, in the project's own folder (a build's are read below).
  if (project?.manifestFile && projectDir) moduleChecks(projectDir, filesOf(projectDir, { depth: 4, max: 3000 }).filter((f) => !SKIP.has(f.split('/')[0])));

  // 7. The build, as it ships: its manifest, its key, its background, its pages.
  if (built) {
    const m = built.manifest;
    const file = built.file('manifest.json');
    const wxt = project?.kind === 'wxt';
    manifestChecks(m, {
      file,
      fix: project?.manifestFile || wxt ? upgradeFix : null,
      cspFix: project?.manifestFile ? `${upgrade} adds it; then build again.` : wxt ? `${upgrade} writes the WXT module that adds it; then build again.` : `Add it where your config writes the policy: cspWithToolaby("…") from toolaby.manifest.js does it.`,
      rebuild: true,
      keyAt: /manifestKey:\s*'[A-Za-z0-9+/]{100,}={0,2}'/.test(configText) && !isStoreBuild(built.dir) ? `${file} has no "key": this build's id depends on where it is loaded from, and once your extension is named the tool key refuses a copy you did not choose. The wiring's config carries it: build again after ${upgrade}.` : null,
    });
    if (configKeyText && builtKeys.some((k) => k !== configKeyText)) add('warn', 'BUILT_KEY_DIFFERS', `${built.name} carries ${builtKeys.length > 1 ? 'keys' : 'a key'} other than toolaby.config.js's (in ${[...new Set(builtKeys.filter((k) => k !== configKeyText).flatMap((k) => built.keys.get(k)))].slice(0, 3).map(oneLine).join(', ')}): it was built before the key changed. Build again.`, { file: built.file(built.keys.get(builtKeys.find((k) => k !== configKeyText))[0]), docs: docs('cli#check-folder') });
    const keyMode = (keyText.split('_')[1]);
    if (!m.update_url && !isStoreBuild(built.dir)) add('ok', 'BUILT_KEY', `${built.name} carries the ${keyMode === 'live' ? 'Live' : keyMode === 'test' ? 'Test' : 'development'} key: it sells on ${keyMode === 'live' ? 'Live' : keyMode === 'test' ? 'Test' : 'a development server'}.`);
    sideChecks(m, builtKeys.length ? builtKeys : [keyText], { file, store: isStoreBuild(built.dir) ? built.name : null });
    // What the manifest names and the build lacks: Chrome refuses a missing side panel, and a missing background runs nothing.
    const named = [[namedWorker(m), 'the background'], [m.action?.default_popup, 'the popup'], [m.side_panel?.default_path, 'the side panel']].filter(([p]) => typeof p === 'string' && p);
    for (const [p, what] of named) if (!built.files.includes(p.replace(/^\/+/, '').replace(/^\.\//, ''))) add('error', 'BUILT_FILE_MISSING', `${file} names ${oneLine(p)}, ${what}, and ${built.name} has no such file.`, { file, docs: docs('frameworks') });
    const worker = namedWorker(m);
    if (worker && built.files.includes(worker)) {
      const code = workerCode(built.dir, worker);
      if (!carriesClient(code.text)) add('error', 'BACKGROUND_NOT_STARTED', `The built background (${oneLine(worker)}${code.files.length > 1 ? ` and the ${code.files.length - 1} files it loads` : ''}) carries nothing of Toolaby's: nothing starts it there, so every page's question goes unanswered. ${project?.kind === 'wxt' ? `${upgrade} writes the WXT module that starts it; then build again.` : `Import toolaby.js in your background's source and call toolaby.startBackground(), then build again.`}`, { file: built.file(worker), fix: project?.kind === 'wxt' ? upgradeFix : undefined, docs: docs('frameworks') });
      else add('ok', 'BACKGROUND_CARRIES', `The built background carries Toolaby's client${o.browser ? '' : ': `--browser` proves that it starts'}.`, { file: built.file(worker) });
    }
    moduleChecks(built.dir, built.files);
  }

  // 8. The client, as fresh as Toolaby's.
  if (project && configKeyText) {
    const client = await fetchBounded(`${key.site}/client/toolaby.js`).then((r) => (r.ok && r.body ? r.body.toString('utf8') : null)).catch(() => null);
    const local = readOr(join(projectDir, `${project.codeDir}toolaby.js`), '');
    if (client === null) add('warn', 'CLIENT_UNREADABLE', 'Toolaby\'s current client could not be read to compare.');
    else if (sha(client) !== sha(local)) add('warn', 'CLIENT_OUTDATED', `toolaby.js is not Toolaby's current client. ${upgrade} replaces it (your own files stay).`, { file: fileOf(join(projectDir, `${project.codeDir}toolaby.js`)), fix: upgradeFix, docs: docs('cli#upgrade-tool-id') });
    else add('ok', 'CLIENT_CURRENT', 'toolaby.js is Toolaby\'s current client.', { file: fileOf(join(projectDir, `${project.codeDir}toolaby.js`)) });
  }

  // 9. The features the code gates on, against the tool's; the page showPaywall() opens; and whether anything can ask to pay.
  const sourcePaths = project ? sourceFiles(projectDir) : [];
  const sources = sourcePaths.map((f) => ({ path: fileOf(f), text: readOr(f, '') }));
  const shipped = built?.manifest ?? (project?.manifestFile ? projectManifest : null);
  if (shipped && sources.some((s) => /\bshowPaywall\s*\(/.test(withoutComments(s.text)))) {
    const root = built?.dir ?? projectDir;
    const pages = [shipped.action?.default_popup ? WALL_POPUP : null, (shipped.side_panel?.default_path || shipped.sidebar_action?.default_panel) ? WALL_SIDE_PANEL : null].filter(Boolean);
    const absent = pages.filter((p) => !existsSync(join(root, `${built ? '' : project.popupDir}${p}`)));
    if (absent.length) add('warn', 'PAYWALL_PAGE_MISSING', `The code calls toolaby.showPaywall(), which opens ${absent.join(' and ')}, and the extension has no such page: the paywall opens the checkout page in a new tab instead. ${upgrade} writes ${absent.length > 1 ? 'them' : 'it'}; your pages stay in front.`, { fix: upgradeFix, docs: docs('troubleshooting#in-the-extension') });
  }
  if (tool) {
    // Where the feature keys are read: the project's source, or — a build alone — its bundle, gate() and showPaywall() only.
    const used = new Map();
    const note = (k, path) => { if (!used.has(k)) used.set(k, path); };
    if (sources.length) for (const s of sources) for (const k of featuresUsed(s.text)) note(k, s.path);
    else if (built) for (const f of built.files.filter((p) => /\.m?js$/.test(p) && !/(^|\/)toolaby[^/]*$/.test(p))) for (const k of featuresUsed(readOr(join(built.dir, f), ''), { bundle: true })) note(k, built.file(f));
    const features = Array.isArray(tool.features) ? tool.features : [];
    const plans = Array.isArray(tool.plans) ? tool.plans : [];
    const known = new Set(features.map((f) => f.key));
    const unknown = [...used.keys()].filter((k) => !known.has(k));
    const flag = liveFlag;
    if (unknown.length) {
      // The features listed now, and the new ones: an archived one sent in this list would be listed again.
      const list = [...features.filter((f) => !f.archived).map((f) => ({ key: f.key, name: f.name, ...(f.blurb ? { blurb: f.blurb } : {}), ...(f.free ? { free: true } : {}) })), ...unknown.map((k) => ({ key: k, name: k }))];
      add('error', 'FEATURE_KEY_UNKNOWN', `The code gates on ${unknown.map((k) => `"${k}"`).join(', ')}, which ${unknown.length > 1 ? 'the tool does not have' : 'is not a feature of the tool'}: every buyer would be refused. Add ${unknown.length > 1 ? 'them' : 'it'} to the tool's features (the command below keeps the ones it has; name ${unknown.length > 1 ? 'them' : 'it'} for buyers), then say which plans unlock ${unknown.length > 1 ? 'them' : 'it'}.`, { file: used.get(unknown[0]), fix: `npx -y toolaby@latest features ${key.slug} --features ${shellWord(JSON.stringify(list))}${flag}`, docs: docs('gating') });
    } else if (used.size) add('ok', 'FEATURES_KNOWN', `The code gates on ${[...used.keys()].map((k) => `"${k}"`).join(', ')}: ${used.size > 1 ? 'all features' : 'a feature'} of the tool.`);
    // Archived (3 Oct 2026): off the checkout, still answered as before — the code works; listing it again is one command.
    const archived = [...used.keys()].filter((k) => features.find((f) => f.key === k)?.archived);
    if (archived.length) add('warn', 'FEATURE_ARCHIVED', `The code gates on ${archived.map((k) => `"${k}"`).join(', ')}, which ${archived.length > 1 ? 'are' : 'is'} archived: whoever holds ${archived.length > 1 ? 'them keeps them' : 'it keeps it'}, and the checkout no longer lists ${archived.length > 1 ? 'them' : 'it'}. List ${archived.length > 1 ? 'them' : 'it'} again on the tool's Pricing page, or take the gate out when ${archived.length > 1 ? 'they go' : 'it goes'}.`, { file: used.get(archived[0]), docs: docs('gating') });
    const sold = new Set(features.filter((f) => !f.free && plans.some((p) => (p.features ?? []).includes(f.key))).map((f) => f.key));
    const unsold = [...used.keys()].filter((k) => known.has(k) && !sold.has(k) && !features.find((f) => f.key === k)?.free);
    if (unsold.length) add('warn', 'FEATURE_NOT_SOLD', `No plan unlocks ${unsold.map((k) => `"${k}"`).join(', ')} yet: buyers are offered nothing for ${unsold.length > 1 ? 'them' : 'it'}. Say which plans do (\`npx -y toolaby@latest features ${key.slug}${flag} --features … --plans …\`, or the tool's Pricing page).`, { file: used.get(unsold[0]), docs: docs('plans') });
    if (tool.access && tool.access !== 'open' && !plans.length) add('warn', 'NO_PLAN', 'The Free plan does not hold everything, and there is no plan to buy. Add one (`npx -y toolaby@latest plan add`, or the tool\'s Pricing page).', { docs: docs('plans') });
    // Whether anything can ever ask anyone to pay: Toolaby's page in front, where the Free plan does not hold the tool's
    // use; a gate() that counts or refuses uses, there too; a feature a plan sells, gated; the paywall or a payment page
    // opened by the code; or the code's own reading of `paid`. With none of them, nobody is ever asked.
    if (sources.length && ['open', 'free_uses', 'paid'].includes(tool.access)) {
      const code = sources.map((s) => withoutComments(s.text)).join('\n');
      const front = project?.manifestFile ? toolabyInFront(built?.manifest ?? projectManifest) : built ? toolabyInFront(built.manifest) : /appPopup:\s*'[^']+'|appSidePanel:\s*'[^']+'/.test(configText);
      const gatesUses = /\bgate\s*\(\s*(?:\)|\d|\{(?![^}]*\bfeature\b))/.test(code);
      const opens = /\b(?:showPaywall|openPaymentPage|openTrialPage)\s*\(/.test(code);
      const readsPaid = /\.\s*paid\b/.test(code);
      const gatesSold = [...used.keys()].some((k) => sold.has(k));
      const possible = gatesSold || opens || readsPaid || (tool.access !== 'open' && (front || gatesUses));
      if (!possible) {
        const why = tool.access === 'open'
          ? `the Free plan holds the tool's use (access: open), and the code gates no feature a plan sells${sold.size ? ` (the plans sell ${[...sold].map((k) => `"${k}"`).join(', ')})` : ''}, opens no paywall and reads no \`paid\``
          : `your own pages stand in front (Toolaby's popup does not), and the code never calls gate(), has() on a sold feature, or showPaywall()`;
        const level = plans.length ? 'error' : 'warn';
        add(level, 'NO_PAYWALL_POSSIBLE', `Nothing in the extension can ever ask anyone to pay: ${why}. ${plans.length ? `The tool sells ${plans.length} plan${plans.length > 1 ? 's' : ''} nobody is offered.` : 'There is nothing to buy yet either.'} Gate the paid action: const permit = await toolaby.gate(${sold.size ? `{ feature: '${[...sold][0]}' }` : ''}); if (!permit.allowed) return toolaby.showPaywall(permit);${tool.access === 'open' && front ? ' Or let the Free plan hold a number of uses.' : ''}`, { fix: tool.access === 'open' && front ? `npx -y toolaby@latest access ${key.slug} --access free_uses --free-uses 10${flag}` : undefined, docs: docs('troubleshooting#in-the-extension') });
      }
    }
  }

  // 10. On the side the key is on: a copy that checked in, and whether the key is current. The session is that side's —
  // the caller's when the caller is on it — and is sent only to that side's own address.
  if (tool && keyWall) {
    const login = `npx -y toolaby@latest login${liveFlag}${keyWall !== WALLS.live && keyWall !== WALLS.test ? ` --server ${keyWall.replace(/\/test$/, '')}` : ''}`;
    const onSide = sideOf(keyWall, mode);
    let api = null;
    if (o.api && callerWall === keyWall) {
      const t = typeof o.token === 'function' ? o.token() : o.token;
      api = o.token === undefined || t ? o.api : null;
    } else {
      const t = sessionFor(keyWall, { env, dir: configDir(env) });
      api = t ? wallApi(keyWall, t, version) : null;
    }
    const notSigned = (more = '') => add('warn', 'NOT_SIGNED_IN', `${more || `Not signed in to ${onSide} (${keyWall})`}, the side this key is on: whether a copy has checked in and whether the key is current were not checked.`, { fix: login, docs: docs('cli#signing-in') });
    if (!api) notSigned();
    else {
      const facts = await api(`/api/cli/tools/${encodeURIComponent(key.slug)}`).catch(() => null);
      if (facts?.status === 401) notSigned(`The session for ${onSide} (${keyWall}) is no longer valid`);
      else if (facts?.status === 404) add('warn', 'TOOL_NOT_YOURS', `${key.slug} is not in the workspaces of the account signed in on ${onSide}: another account of yours owns it? \`npx -y toolaby@latest whoami${liveFlag}\` says who is signed in.`, { fix: `npx -y toolaby@latest whoami${liveFlag}`, docs: docs('cli#login-whoami-logout') });
      else if (facts?.ok) {
        const seen = facts.json?.extension?.checkedInAt;
        if (seen) add('ok', 'CHECKED_IN', `A copy of the extension checked in (${new Date(seen).toISOString().slice(0, 16).replace('T', ' ')} UTC).`);
        else add('warn', 'NOT_CHECKED_IN', 'No copy has checked in yet: load it at chrome://extensions and open it once.', { docs: docs('quickstart') });
        // The key carries what the Free plan holds and the kind of plan sold: a change since it was written leaves it behind.
        const current = facts.json?.toolKey;
        if (typeof current === 'string' && current.split('_')[1] === mode && current !== keyText) add('warn', 'KEY_OUTDATED', `The tool key in ${configKeyText ? 'toolaby.config.js' : built?.name} is older than Toolaby's: what the Free plan holds, the plans or the signing key changed since it was written. ${upgrade} writes the current one${built ? '; then build again' : ''}.`, { file: keyFile, fix: upgradeFix, docs: docs('cli#upgrade-tool-id') });
      }
    }
  }

  // 11. This command, as current as the one Toolaby serves.
  if (keyWall && version) {
    const served = await servedVersion(keyWall);
    if (served && olderThan(version, served)) add('warn', 'CLI_OUTDATED', `This command is ${version}; Toolaby serves ${served}. An older one checks by older rules: run the current one, or Toolaby's own copy (npx -y ${keyWall}/toolaby.tgz check).`, { fix: 'npx -y toolaby@latest check', docs: docs('cli') });
    else if (served) add('ok', 'CLI_CURRENT', `This command (${version}) is as current as the one Toolaby serves.`);
  }

  // 12. In a browser: the background answers Toolaby's client on its own line, and the pages open.
  if (o.browser || o.as) {
    const target = built?.dir ?? (project?.kind === 'plain' && !project.built ? projectDir : [...BUILD_DIRS.map((d) => join(projectDir ?? dir, d)), ...(project?.kind === 'plain' ? [projectDir] : [])].find((d) => existsSync(join(d, 'manifest.json'))));
    if (!target) add('error', 'NOTHING_BUILT', `No built extension to load: build first (${project?.label ?? 'your build'}), or name its folder with --built.`, { docs: docs('cli#check-folder') });
    else {
      const loaded = built?.dir === target ? built.manifest : parseManifest(readOr(join(target, 'manifest.json'), '')).manifest;
      // --as <plan>: the test licence `test-unlock` made for that plan, entered in the loaded extension (lib/test-licences).
      // Kept under the address test-unlock was run against: the key's Toolaby, or the one this command was told.
      const licence = o.as ? [keyWall, callerWall].filter(Boolean).map((w) => testLicenceFor(configDir(env), w, key.slug, o.as)).find(Boolean) ?? null : null;
      if (o.as && !licence) add('error', 'TEST_LICENCE_MISSING', `No test licence for ${o.as}: make one first.`, { fix: `npx -y toolaby@latest test-unlock ${key.slug} --plan ${o.as}`, docs: docs('agents') });
      await browserCheck({ built: target, manifest: loaded, slug: key.slug, folder: projectDir ?? target, cache: playwrightCache(configDir(env)), env, log, add, docs, rel: rel(target), licence });
    }
  }
  return done();
}

/** The line that ends a check: how many findings ask for a fix, and how many for a look. */
export function checkSummary(result) {
  const n = (level) => result.findings.filter((f) => f.level === level).length;
  return `${n('error') ? `${n('error')} to fix` : 'Nothing to fix'}${n('warn') ? `, ${n('warn')} to look at` : ''}.`;
}
