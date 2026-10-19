// Generated from Toolaby's wiring rules: do not edit by hand.
import { isTestAddress } from './test-address.js';
export const WALL_POPUP = 'toolaby-popup.html';
export const WALL_SIDE_PANEL = 'toolaby-sidepanel.html';
export const WORKER_LINES = "import { toolaby } from './toolaby.js';\n\ntoolaby.startBackground();\n";
export const WALL_WORKER = 'toolaby.background.js';
export const CLASSIC_CLIENT = 'toolaby-client.js';
const WRAPS = /^\/\/ toolaby-wraps: (.+)$/m;
const SCRIPT_PATH = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9_][A-Za-z0-9_\-./]*\.m?js$/;
export function withoutComments(text) {
    return text.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => (str ? m : ''));
}
export function parseManifest(text) {
    const clean = String(text ?? '').replace(/^\uFEFF/, '');
    try {
        return { manifest: JSON.parse(clean), comments: false };
    }
    catch { }
    const plain = withoutComments(clean).replace(/("(?:[^"\\\n]|\\.)*")|,(\s*[}\]])/g, (m, str, tail) => (str ? m : tail));
    try {
        return { manifest: JSON.parse(plain), comments: true };
    }
    catch (e) {
        return { manifest: null, comments: false, error: e.message };
    }
}
export function notManifestV3(manifest) {
    const version = manifest?.manifest_version;
    if (version === 3)
        return null;
    if (version === 2)
        return 'This is a Manifest V2 extension (manifest_version 2), and Chrome runs Manifest V3 extensions only. Move it to Manifest V3 first, then wire it: https://developer.chrome.com/docs/extensions/develop/migrate';
    return `manifest.json says manifest_version ${JSON.stringify(version ?? null)}: Chrome runs Manifest V3 extensions, with "manifest_version": 3.`;
}
export const startsPlatform = (source) => {
    const code = withoutComments(source);
    if (!/\b(?:startBackground|ensureBackground)\s*\(/.test(code))
        return false;
    return !((/\bExtPay\s*\(/.test(code) || /extensionpay\.com/.test(code)) && !/toolaby/i.test(code));
};
export const wrappedBy = (source) => source?.match(WRAPS)?.[1]?.trim() || null;
export function wallWorkerSource(b, config) {
    const depth = b.file.split('/').length - 1;
    const up = '../'.repeat(depth);
    const own = b.wraps.slice(b.wraps.lastIndexOf('/') + 1);
    const head = `// Toolaby's background, in front of yours: ${b.wraps} runs as it did, then Toolaby starts.\n// Written by Toolaby's wiring (npx -y toolaby@latest wire): keep it, never edit it. Your code stays in ${b.wraps}.\n// toolaby-wraps: ${b.wraps}\n`;
    if (!b.classic)
        return `${head}import { toolaby } from '${up || './'}toolaby.js';\nimport './${own}';\n\ntoolaby.ensureBackground();\n`;
    const c = config ?? { key: '', appPopup: '', appSidePanel: '' };
    return `${head}importScripts('${up}${CLASSIC_CLIENT}');\nself.toolaby = Toolaby(${JSON.stringify({ key: c.key, appPopup: c.appPopup, appSidePanel: c.appSidePanel, ...(typeof c.countOpens === 'boolean' ? { countOpens: c.countOpens } : {}), ...(c.uninstallPage === false ? { uninstallPage: false } : {}) })});\nimportScripts('${own}');\ntoolaby.ensureBackground();\n`;
}
export function configValues(text) {
    const code = withoutComments(text);
    const get = (name) => code.match(new RegExp(`${name}:\\s*'([^']*)'`))?.[1];
    const key = get('key');
    const opens = code.match(/countOpens:\s*(true|false)\b/)?.[1];
    const bye = code.match(/uninstallPage:\s*(true|false)\b/)?.[1];
    return key ? { key, appPopup: get('appPopup') ?? '', appSidePanel: get('appSidePanel') ?? '', ...(opens ? { countOpens: opens === 'true' } : {}), ...(bye ? { uninstallPage: bye === 'true' } : {}) } : null;
}
export const loadableName = (file) => {
    const clean = file.split('/').filter((p) => p && p !== '.' && p !== '..').map((p) => p.replace(/[^A-Za-z0-9_\-.]+/g, '-').replace(/^[^A-Za-z0-9_]+/, '')).filter(Boolean).join('/');
    const js = /\.m?js$/.test(clean) ? clean : `${clean.replace(/\.[^./]*$/, '') || 'background'}.js`;
    return js.replace(/-+(?=\.m?js$)/, '');
};
export const namedWorker = (manifest) => typeof manifest?.background?.service_worker === 'string' ? manifest.background.service_worker.trim().replace(/^(\.\/)+/, '') || null : null;
export function sitePattern(site) {
    try {
        return `${new URL(site).origin}/*`;
    }
    catch {
        return `${site.replace(/\/+$/, '')}/*`;
    }
}
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
    const csp = manifest.content_security_policy;
    const allowing = csp && typeof csp === 'object' && typeof csp.extension_pages === 'string' ? cspConnecting(csp.extension_pages, pattern.slice(0, -2)) : null;
    if (allowing) {
        manifest.content_security_policy = { ...csp, extension_pages: allowing };
        did.push(`${host} in the content security policy's connect-src, which Toolaby's calls need`);
        added.push('connect-src');
    }
    const declared = typeof manifest.action?.default_popup === 'string' ? manifest.action.default_popup : null;
    const ownPopup = declared && declared !== WALL_POPUP ? declared : declared === WALL_POPUP ? (o.remembered || null) : null;
    const appPopup = o.ownInFront ? null : ownPopup;
    if (appPopup && declared !== WALL_POPUP) {
        manifest.action = { ...manifest.action, default_popup: WALL_POPUP };
        did.push(`Toolaby's popup in front of ${appPopup}: it opens on to yours while the device may, and shows the panel when it may not`);
    }
    if (o.ownInFront && declared === WALL_POPUP && ownPopup) {
        manifest.action = { ...manifest.action, default_popup: ownPopup };
        did.push(`${ownPopup} back in front: toolaby.showPaywall() opens Toolaby's popup`);
    }
    const theirs = (v) => (typeof v === 'string' && v !== WALL_SIDE_PANEL ? v : null);
    const declaredPanel = typeof manifest.side_panel?.default_path === 'string' ? manifest.side_panel.default_path : null;
    const declaredSidebar = typeof manifest.sidebar_action?.default_panel === 'string' ? manifest.sidebar_action.default_panel : null;
    const ours = declaredPanel === WALL_SIDE_PANEL || declaredSidebar === WALL_SIDE_PANEL;
    const ownSidePanel = theirs(declaredPanel) ?? theirs(declaredSidebar) ?? (ours ? o.rememberedSidePanel || null : null);
    const appSidePanel = o.ownInFront ? null : ownSidePanel;
    if (o.ownInFront) {
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
    if (!o.ownInFront && theirs(declaredSidebar) && (!declaredPanel || declaredSidebar === declaredPanel)) {
        manifest.sidebar_action = { ...manifest.sidebar_action, default_panel: WALL_SIDE_PANEL };
        did.push(`Toolaby's side panel in front of ${declaredSidebar} in Firefox's sidebar_action too`);
    }
    const named = namedWorker(manifest);
    let background;
    let workerMoved = false;
    if (named && !o.has(named) && o.built) {
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
