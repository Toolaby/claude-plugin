// Generated from wall/src/packages/wiring/manifest.ts by wall/scripts/pack-create.mjs — edit there.
import { isTestAddress } from './test-address.js';
/**
 * What wiring an extension does to its manifest — the same in the browser
 * (Wire my extension, from the tool's page) and in the terminal
 * (`toolaby wire`, packages/toolaby-cli/bin.mjs):
 * the storage permission; the platform's address for externally_connectable
 * (the site's sign-in and purchase handoffs), and no host permission, which
 * the client never needs (wireManifest says why); a module service worker
 * when the manifest names none, or names one that is
 * not there — and in front of the extension's own background, Toolaby's,
 * which runs it and then starts the platform (wallWorkerSource), so nothing
 * of theirs is edited; Toolaby's popup in front of the extension's own — and its
 * side panel in front of the extension's side panel — which the
 * configuration then remembers; and the extension's identity — the `key`
 * that fixes its id, which the tool key is bound to (identity.ts) — unless
 * the manifest has one of its own, which is then the identity the platform
 * adopts. Pure: given the manifest and what is on disk, it says what to
 * write. An extension whose own pages draw the panel (drawsItself) keeps
 * them in front: nothing of Toolaby's is put there.
 */
export const WALL_POPUP = 'toolaby-popup.html';
export const WALL_SIDE_PANEL = 'toolaby-sidepanel.html';
export const WORKER_LINES = "import { toolaby } from './toolaby.js';\n\ntoolaby.startBackground();\n";
/** Toolaby's background: the one it writes when the manifest names none, and the one it stands in front of theirs. */
export const WALL_WORKER = 'toolaby.background.js';
/** The client as a classic script (a global `Toolaby`): what a classic background loads with importScripts(). */
export const CLASSIC_CLIENT = 'toolaby-client.js';
/** The line in Toolaby's background that names the extension's own, which it runs: read back when wired again. */
const WRAPS = /^\/\/ toolaby-wraps: (.+)$/m;
/** A background Toolaby's can name in the code it writes: a path inside the folder, plain characters, a script. */
const SCRIPT_PATH = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9_][A-Za-z0-9_\-./]*\.m?js$/;
/** Code without its comments, strings kept whole, so a `//` inside one is not taken for a comment. */
export function withoutComments(text) {
    return text.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => (str ? m : ''));
}
/**
 * manifest.json as Chrome reads it: JSON that may carry comments and a trailing comma (Vimium's does; 1 Oct 2026), which
 * JSON.parse refuses. `comments` says whether the text needed them gone: written back, the manifest is plain JSON.
 */
export function parseManifest(text) {
    const clean = String(text ?? '').replace(/^\uFEFF/, '');
    try {
        return { manifest: JSON.parse(clean), comments: false };
    }
    catch { /* JSON with comments, or not JSON at all */ }
    const plain = withoutComments(clean).replace(/("(?:[^"\\\n]|\\.)*")|,(\s*[}\]])/g, (m, str, tail) => (str ? m : tail));
    try {
        return { manifest: JSON.parse(plain), comments: true };
    }
    catch (e) {
        return { manifest: null, comments: false, error: e.message };
    }
}
/** Why Chrome would not run this manifest as a Manifest V3 extension, or null: what wire and check refuse before anything else. */
export function notManifestV3(manifest) {
    const version = manifest?.manifest_version;
    if (version === 3)
        return null;
    if (version === 2)
        return 'This is a Manifest V2 extension (manifest_version 2), and Chrome runs Manifest V3 extensions only. Move it to Manifest V3 first, then wire it: https://developer.chrome.com/docs/extensions/develop/migrate';
    return `manifest.json says manifest_version ${JSON.stringify(version ?? null)}: Chrome runs Manifest V3 extensions, with "manifest_version": 3.`;
}
/** Whether a background already starts Toolaby itself: then it is left as it is. */
export const startsPlatform = (source) => {
    const code = withoutComments(source);
    if (!/\b(?:startBackground|ensureBackground)\s*\(/.test(code))
        return false;
    // ExtensionPay's background starts with the same words, `extpay.startBackground()`: one that never names Toolaby has
    // not started it, and gets Toolaby's background in front, which its ExtPay — Toolaby's now (wiring/extpay) — needs
    // to answer at all. It started nothing on Goose and Switch Last Tabs, wired from the wild (1 Oct 2026); nor on a
    // build with ExtPay minified inside it, past its name but not its site.
    return !((/\bExtPay\s*\(/.test(code) || /extensionpay\.com/.test(code)) && !/toolaby/i.test(code));
};
/** The extension's own background Toolaby's runs, read from Toolaby's; null for any other file. */
export const wrappedBy = (source) => source?.match(WRAPS)?.[1]?.trim() || null;
/**
 * Toolaby's background in front of the extension's own (`file`, beside `wraps`, so a relative importScripts() of
 * theirs still finds its files): it runs theirs as before, then starts Toolaby unless theirs did — ensureBackground(),
 * so a background that starts it with handlers of its own keeps them. A module background gets a module; a classic
 * one a classic script, which loads the client as one (CLASSIC_CLIENT), so its importScripts() work as they did. The
 * classic one carries the configuration it starts with — the key and the pages of toolaby.config.js — which wiring
 * again rewrites with it.
 */
export function wallWorkerSource(b, config) {
    const depth = b.file.split('/').length - 1;
    const up = '../'.repeat(depth);
    const own = b.wraps.slice(b.wraps.lastIndexOf('/') + 1);
    const head = `// Toolaby's background, in front of yours: ${b.wraps} runs as it did, then Toolaby starts.\n// Written by Toolaby's wiring (npx -y toolaby@latest wire): keep it, never edit it. Your code stays in ${b.wraps}.\n// toolaby-wraps: ${b.wraps}\n`;
    if (!b.classic)
        return `${head}import { toolaby } from '${up || './'}toolaby.js';\nimport './${own}';\n\ntoolaby.ensureBackground();\n`;
    const c = config ?? { key: '', appPopup: '', appSidePanel: '' };
    return `${head}importScripts('${up}${CLASSIC_CLIENT}');\nself.toolaby = Toolaby(${JSON.stringify({ key: c.key, appPopup: c.appPopup, appSidePanel: c.appSidePanel, ...(typeof c.countOpens === 'boolean' ? { countOpens: c.countOpens } : {}) })});\nimportScripts('${own}');\ntoolaby.ensureBackground();\n`;
}
/** What toolaby.config.js starts Toolaby with, read from its text: what a classic background of Toolaby's carries. */
export function configValues(text) {
    const code = withoutComments(text);
    const get = (name) => code.match(new RegExp(`${name}:\\s*'([^']*)'`))?.[1];
    const key = get('key');
    const opens = code.match(/countOpens:\s*(true|false)\b/)?.[1];
    return key ? { key, appPopup: get('appPopup') ?? '', appSidePanel: get('appSidePanel') ?? '', ...(opens ? { countOpens: opens === 'true' } : {}) } : null;
}
/** A name a background can be loaded by, for one that has none: its characters kept where they can be, the rest a dash. */
export const loadableName = (file) => {
    const clean = file.split('/').filter((p) => p && p !== '.' && p !== '..').map((p) => p.replace(/[^A-Za-z0-9_\-.]+/g, '-').replace(/^[^A-Za-z0-9_]+/, '')).filter(Boolean).join('/');
    const js = /\.m?js$/.test(clean) ? clean : `${clean.replace(/\.[^./]*$/, '') || 'background'}.js`;
    return js.replace(/-+(?=\.m?js$)/, '');
};
/** The background the manifest names, as the folder spells it: "./background.js" is background.js. */
export const namedWorker = (manifest) => typeof manifest?.background?.service_worker === 'string' ? manifest.background.service_worker.trim().replace(/^(\.\/)+/, '') || null : null;
/**
 * The match pattern a manifest names Toolaby by: the origin of the key's site, whatever path follows it —
 * `https://northwind.toolaby.app/*` on Live; on Test, the address Toolaby made for the workspace
 * (`https://quiet-otter-4172.toolaby.app/*`, ./test-address). A wiring to one side takes the other's Test address out.
 */
export function sitePattern(site) {
    try {
        return `${new URL(site).origin}/*`;
    }
    catch {
        return `${site.replace(/\/+$/, '')}/*`;
    }
}
/**
 * An extension's content security policy with Toolaby in what it may connect to, or null when it allows it already.
 * The client asks Toolaby (`origin`) from the extension's pages and its background, and fetches its own popup's page
 * to see that it is there ('self'), all of which connect-src governs, or default-src where there is no connect-src.
 * ExtensionPay's extensions often allow extensionpay.com alone: ten of 69 did, and wired, every call of Toolaby's failed
 * to fetch (1 Oct 2026). Only that directive changes, and only by what is missing; the rest is kept as written.
 */
export function cspConnecting(policy, origin) {
    let url;
    try {
        url = new URL(origin);
    }
    catch {
        return null;
    }
    const parts = policy.split(';');
    const name = (part) => part.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const at = parts.findIndex((p) => name(p) === 'connect-src');
    const base = at >= 0 ? at : parts.findIndex((p) => name(p) === 'default-src');
    if (base < 0)
        return null;
    // 'none' with sources beside it means nothing, and default-src's script keywords mean nothing to connect-src.
    const sources = parts[base].trim().split(/\s+/).slice(1).filter((s) => !s.startsWith("'") || s.toLowerCase() === "'self'");
    const allows = (want) => sources.some((raw) => {
        const s = raw.toLowerCase().replace(/\/+$/, '');
        if (s === '*')
            return true;
        if (want === "'self'")
            return s === "'self'";
        if (s === url.protocol || (s === 'http:' && url.protocol === 'https:'))
            return true;
        if (s === url.origin || s.startsWith(`${url.origin}/`))
            return true;
        const wild = s.match(/^(https?):\/\/\*\.([^/]+)/);
        return !!wild && `${wild[1]}:` === url.protocol && url.host.endsWith(`.${wild[2]}`);
    });
    const missing = ["'self'", url.origin].filter((s) => !allows(s));
    if (!missing.length)
        return null;
    const directive = `connect-src ${[...sources, ...missing].join(' ')}`;
    if (at >= 0) {
        const lead = parts[at].match(/^\s*/)?.[0] ?? '';
        const tail = parts[at].match(/\s*$/)?.[0] ?? '';
        parts[at] = `${lead}${directive}${tail}`;
        return parts.join(';');
    }
    const end = policy.trimEnd();
    return `${end}${end.endsWith(';') || !end ? '' : ';'} ${directive}`.trimStart();
}
/**
 * Whether an earlier wiring left the extension's own pages drawing the panel: a configuration that says '' for both
 * pages while the manifest names none of Toolaby's. That is what `create` makes, and the "your popup first" shape
 * (docs/gating); a wiring keeps it rather than putting Toolaby's page back in front. A first wiring (no configuration
 * yet) puts Toolaby's in front.
 */
export function drawsItself(manifest, oldConfig) {
    if (!oldConfig)
        return false;
    const popup = oldConfig.match(/appPopup:\s*'([^']*)'/);
    const side = oldConfig.match(/appSidePanel:\s*'([^']*)'/);
    if (!popup || popup[1] !== '' || (side && side[1] !== ''))
        return false;
    const pages = [manifest?.action?.default_popup, manifest?.side_panel?.default_path, manifest?.sidebar_action?.default_panel];
    return !pages.some((p) => p === WALL_POPUP || p === WALL_SIDE_PANEL);
}
export function wireManifest(input, o) {
    const manifest = JSON.parse(JSON.stringify(input));
    const did = [];
    const added = [];
    const host = (() => { try {
        return new URL(o.site).host;
    }
    catch {
        return o.site;
    } })();
    // The identity: the manifest's own key stays (the platform adopts it); otherwise the platform's goes in, and the unpacked extension's id is known before it loads.
    const own = typeof manifest.key === 'string' && manifest.key.trim() ? manifest.key.trim() : null;
    if (!own && o.manifestKey) {
        manifest.key = o.manifestKey;
        did.push('a "key", so the extension keeps one id across reloads and machines');
        added.push('key');
    }
    const manifestKey = own ?? o.manifestKey ?? null;
    const add = (list, value) => { const arr = Array.isArray(list) ? [...list] : []; if (!arr.includes(value))
        arr.push(value); return arr; };
    if (!(Array.isArray(manifest.permissions) && manifest.permissions.includes('storage'))) {
        manifest.permissions = add(manifest.permissions, 'storage');
        did.push('the "storage" permission');
        added.push('storage');
    }
    const pattern = sitePattern(o.site);
    const unneeded = [];
    // A Test address of Toolaby's that is not this key's (./test-address): left by an earlier wiring to the other side.
    // Test's workspaces have hosts of their own, and a build wired for Test and then for Live went on asking its buyers,
    // at install, for access to Test's host too (29 Sep 2026). Only under Toolaby's own address: a host of the
    // developer's that reads like one, on a domain of theirs, was taken out of their build too (30 Sep 2026).
    const apex = (o.apex ?? host.split('.').slice(1).join('.')).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const underWall = new RegExp(`^https://([a-z0-9-]+)\\.${apex}/\\*$`);
    const stale = (p) => typeof p === 'string' && p !== pattern && isTestAddress(underWall.exec(p)?.[1]);
    for (const field of ['host_permissions', 'externally_connectable']) {
        const list = field === 'host_permissions' ? manifest.host_permissions : manifest.externally_connectable?.matches;
        const gone = Array.isArray(list) ? list.filter(stale) : [];
        if (!gone.length)
            continue;
        const kept = list.filter((p) => !stale(p));
        if (field === 'host_permissions')
            manifest.host_permissions = kept;
        else
            manifest.externally_connectable = { ...manifest.externally_connectable, matches: kept };
        for (const p of gone)
            did.push(`${field === 'host_permissions' ? 'the host permission' : 'externally_connectable'} for ${p.slice('https://'.length, -2)} taken out: a Test address that is not this key's`);
    }
    // No host permission for Toolaby's address, and the one a wiring before 2 Oct 2026 gave is taken out. Every call the
    // client makes is a request the browser checks against the answer's CORS headers, which each route it calls sends
    // (wall/src/packages/cors): a host permission only stepped around that check. And it cost: Chrome shows one to everyone
    // installing ("Read and change your data on …"), and switches off an update that adds one until each user approves it
    // — every extension moved from ExtensionPay, whose library asks for storage alone, would have been, for all its users.
    // An update that drops one asks no one anything. Only the key's own address goes: any other host is the developer's.
    // externally_connectable stays: the site's sign-in and purchase pages reach the extension by it, and it shows nothing.
    // Any address of Toolaby's goes, not only the key's: toolaby.app itself, a workspace's or Test's address under it, or
    // under this Toolaby server's own apex. None is ever the developer's, and none is ever needed; an agent fixing an extension left
    // `https://toolaby.app/*` in place because only the key's own address was taken out (2 Oct 2026).
    // Toolaby's own apex only: toolaby.app, and the one this wiring was told (a development server's). Never one guessed
    // from the key's host, which on a Pro workspace's own domain is the developer's (accounts.acme.com → acme.com).
    const told = o.apex ? o.apex.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
    const toolabyHost = new RegExp(`^(https?|\\*)://(\\*\\.|[a-z0-9-]+\\.)?(${told ? `${told}|` : ''}toolaby\\.app)(:\\d+)?/`, 'i');
    const toolabys = (p) => typeof p === 'string' && (p === pattern || toolabyHost.test(p));
    if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.some(toolabys)) {
        const gone = manifest.host_permissions.filter(toolabys);
        const kept = manifest.host_permissions.filter((p) => !toolabys(p));
        if (kept.length)
            manifest.host_permissions = kept;
        else
            delete manifest.host_permissions;
        for (const p of gone) {
            const line = `the host permission for ${p === pattern ? host : String(p).replace(/^[a-z*]+:\/\/|\/\*?$/gi, '')} taken out: Toolaby needs none, and Chrome showed it to everyone installing`;
            did.push(line);
            unneeded.push(line);
        }
    }
    const ec = manifest.externally_connectable ?? {};
    if (!(Array.isArray(ec.matches) && ec.matches.includes(pattern))) {
        manifest.externally_connectable = { ...ec, matches: add(ec.matches, pattern) };
        did.push(`externally_connectable for ${host}`);
        if (!added.includes(host))
            added.push(host);
    }
    // A content security policy that limits connections: Toolaby in what it allows (cspConnecting).
    const csp = manifest.content_security_policy;
    const allowing = csp && typeof csp === 'object' && typeof csp.extension_pages === 'string' ? cspConnecting(csp.extension_pages, pattern.slice(0, -2)) : null;
    if (allowing) {
        manifest.content_security_policy = { ...csp, extension_pages: allowing };
        did.push(`${host} in the content security policy's connect-src, which Toolaby's calls need`);
        added.push('connect-src');
    }
    // The extension's own popup: the manifest's, or the one remembered when the manifest already names Toolaby's.
    const declared = typeof manifest.action?.default_popup === 'string' ? manifest.action.default_popup : null;
    const ownPopup = declared && declared !== WALL_POPUP ? declared : declared === WALL_POPUP ? (o.remembered || null) : null;
    const appPopup = o.ownInFront ? null : ownPopup;
    if (appPopup && declared !== WALL_POPUP) {
        manifest.action = { ...manifest.action, default_popup: WALL_POPUP };
        did.push(`Toolaby's popup in front of ${appPopup}: it opens on to yours while the device may, and shows the panel when it may not`);
    }
    // Asked to keep the extension's own in front after a wiring stood Toolaby's there: theirs goes back.
    if (o.ownInFront && declared === WALL_POPUP && ownPopup) {
        manifest.action = { ...manifest.action, default_popup: ownPopup };
        did.push(`${ownPopup} back in front: toolaby.showPaywall() opens Toolaby's popup`);
    }
    // The extension's own side panel, the same way: Toolaby's in front, with the permission a side panel needs.
    // Chrome spells it side_panel.default_path, Firefox sidebar_action.default_panel; a manifest may carry both.
    const theirs = (v) => (typeof v === 'string' && v !== WALL_SIDE_PANEL ? v : null);
    const declaredPanel = typeof manifest.side_panel?.default_path === 'string' ? manifest.side_panel.default_path : null;
    const declaredSidebar = typeof manifest.sidebar_action?.default_panel === 'string' ? manifest.sidebar_action.default_panel : null;
    const ours = declaredPanel === WALL_SIDE_PANEL || declaredSidebar === WALL_SIDE_PANEL;
    const ownSidePanel = theirs(declaredPanel) ?? theirs(declaredSidebar) ?? (ours ? o.rememberedSidePanel || null : null);
    const appSidePanel = o.ownInFront ? null : ownSidePanel;
    if (o.ownInFront) {
        // The extension's own side panel stays in front, as its popup does — and goes back there after a wiring put Toolaby's.
        if (declaredPanel === WALL_SIDE_PANEL && ownSidePanel) {
            manifest.side_panel = { ...manifest.side_panel, default_path: ownSidePanel };
            did.push(`${ownSidePanel} back in front: toolaby.showPaywall() opens Toolaby's side panel`);
        }
        if (declaredSidebar === WALL_SIDE_PANEL && ownSidePanel)
            manifest.sidebar_action = { ...manifest.sidebar_action, default_panel: ownSidePanel };
    }
    else if (theirs(declaredPanel)) {
        manifest.side_panel = { ...manifest.side_panel, default_path: WALL_SIDE_PANEL };
        if (!(Array.isArray(manifest.permissions) && manifest.permissions.includes('sidePanel')))
            manifest.permissions = add(manifest.permissions, 'sidePanel');
        did.push(`Toolaby's side panel in front of ${declaredPanel}: the same as the popup, at the panel's width`);
    }
    // Firefox's sidebar, when it names the same page — one that names another is left alone rather than pointed elsewhere.
    if (!o.ownInFront && theirs(declaredSidebar) && (!declaredPanel || declaredSidebar === declaredPanel)) {
        manifest.sidebar_action = { ...manifest.sidebar_action, default_panel: WALL_SIDE_PANEL };
        did.push(`Toolaby's side panel in front of ${declaredSidebar} in Firefox's sidebar_action too`);
    }
    // The background. None named, or named and not there: one of Toolaby's alone, a module. The extension's own: left as
    // it is, and Toolaby's stood in front of it — beside it, a module for a module and a classic script for a classic
    // one — unless it starts Toolaby already. Wired again, Toolaby's is written again for the one it names.
    const named = namedWorker(manifest);
    let background;
    let workerMoved = false;
    if (named && !o.has(named) && o.built) {
        // Vite's or webpack's output (Linkwarden, wired on 1 Oct 2026): a two-line background written at that name stood where
        // the build writes the extension's own, and copied as the summary says, it would have replaced it.
        background = { kind: 'built', file: named };
    }
    else if (!named || !o.has(named)) {
        const file = named ?? (o.has('background.js') ? WALL_WORKER : 'background.js');
        manifest.background = { service_worker: file, type: 'module' };
        did.push(`a service worker, ${file} (two lines: it starts the platform)`);
        background = { kind: 'new', file };
    }
    else {
        const source = o.workerSource ?? '';
        const wraps = wrappedBy(source);
        const theirs = wraps ?? named;
        const classic = manifest.background?.type !== 'module';
        if (!wraps && startsPlatform(source))
            background = { kind: 'started', file: named };
        else if (wraps && !o.has(wraps))
            background = { kind: 'gone', file: named, wraps };
        else if (/\.(ts|tsx|mts|cts|jsx)$/.test(theirs))
            background = { kind: 'lines', file: theirs };
        else if (!SCRIPT_PATH.test(theirs))
            background = { kind: 'rename', file: theirs, to: loadableName(theirs) };
        else {
            const file = wraps ? named : `${theirs.includes('/') ? theirs.slice(0, theirs.lastIndexOf('/') + 1) : ''}${WALL_WORKER}`;
            if (!wraps) {
                manifest.background = { ...manifest.background, service_worker: file };
                workerMoved = true;
            }
            background = { kind: 'wrap', file, wraps: theirs, classic };
        }
    }
    const changed = did.length > 0 || workerMoved;
    return { manifest, did, added, unneeded, changed, background, appPopup, appSidePanel, manifestKey, ownPopup, ownSidePanel };
}
