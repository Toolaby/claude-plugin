// Generated from Toolaby's wiring rules: do not edit by hand.
import { sitePattern } from './manifest.js';
export const BUILD_COPY_NOTE = 'A build ships this extension: make sure it copies every toolaby* file to its output — toolaby.js, toolaby.config.js, toolaby-popup.html and the rest — the way it copies your popup.html.';
export const CODE_FILES = ['toolaby.config.js', 'toolaby.js', 'toolaby.d.ts'];
export const MANIFEST_HELPER = ['toolaby.manifest.js', 'toolaby.manifest.d.ts'];
export const POPUP_FILES = ['toolaby-popup.html', 'toolaby-popup.js'];
export const SIDE_PANEL_FILES = ['toolaby-sidepanel.html', 'toolaby-sidepanel.js'];
export const AGENT_FILES = [
    { name: 'TOOLABY.md', path: 'TOOLABY.md' },
    { name: 'SKILL.md', path: '.claude/skills/toolaby/SKILL.md' },
];
export const AGENT_ENTRY_FILES = ['AGENTS.md', 'CLAUDE.md'];
export const SKILL_NAMES = ['toolaby', 'toolaby-sell-a-feature', 'toolaby-pricing', 'toolaby-test-a-purchase', 'toolaby-ship', 'toolaby-extensionpay-move', 'toolaby-extension-patterns'];
export const SKILL_DIRS = ['.claude/skills', '.agents/skills'];
export const skillPaths = () => SKILL_DIRS.flatMap((dir) => SKILL_NAMES.map((name) => `${dir}/${name}/SKILL.md`));
export const TOOLABY_START = '<!-- TOOLABY START -->';
export const TOOLABY_END = '<!-- TOOLABY END -->';
export function mergeToolabyBlock(existing, block) {
    const end = existing.lastIndexOf(TOOLABY_END);
    const start = end < 0 ? -1 : existing.lastIndexOf(TOOLABY_START, end);
    if (start >= 0)
        return `${existing.slice(0, start)}${block}${existing.slice(end + TOOLABY_END.length)}`;
    const body = existing.replace(/\s+$/, '');
    return `${body}${body ? '\n\n' : ''}${block}\n`;
}
export function agentWrites(files, own, block) {
    const out = [];
    const text = (name) => (typeof files[name] === 'string' ? files[name] : null);
    if (text('TOOLABY.md') !== null)
        out.push({ path: 'TOOLABY.md', content: text('TOOLABY.md') });
    const skills = skillPaths().filter((p) => text(p) !== null);
    if (skills.length)
        for (const p of skills)
            out.push({ path: p, content: text(p) });
    else if (text('SKILL.md') !== null)
        out.push({ path: '.claude/skills/toolaby/SKILL.md', content: text('SKILL.md') });
    const marked = (s) => s.includes(TOOLABY_START) && s.includes(TOOLABY_END);
    const entry = (path, mine, readsAgents) => {
        if (mine === null) {
            if (text(path) !== null)
                out.push({ path, content: text(path) });
            return;
        }
        if (!block || (readsAgents && !marked(mine)))
            return;
        const merged = mergeToolabyBlock(mine, block);
        if (merged !== mine)
            out.push({ path, content: merged });
    };
    entry('AGENTS.md', own.agents, false);
    entry('CLAUDE.md', own.claude, own.claude !== null && /^\s*@AGENTS\.md\s*$/m.test(own.claude));
    return out;
}
export const STALE_FILES = ['toolaby-client.module.js', 'paywall.js', 'paywall.css', 'toolaby-popup.css', 'toolaby-account.js'];
export const filesToWrite = (p, appPopup, appSidePanel = null, own = {}) => [
    ...CODE_FILES.map((f) => `${p.codeDir}${f}`),
    ...(p.manifestFile ? [] : MANIFEST_HELPER.map((f) => `${p.codeDir}${f}`)),
    ...(appPopup || own.popup ? POPUP_FILES.map((f) => `${p.popupDir}${f}`) : []),
    ...(appSidePanel || own.sidePanel ? SIDE_PANEL_FILES.map((f) => `${p.popupDir}${f}`) : []),
    ...(p.extraFiles ?? []).map((f) => f.to),
    ...AGENT_FILES.map((f) => f.path),
];
export const SURFACES = ['both', 'popup', 'side-panel', 'none'];
export const surfacesOf = (v) => SURFACES.includes(v ?? '') ? v : 'both';
export const hasPopup = (s) => s === 'both' || s === 'popup';
export const hasSidePanel = (s) => s === 'both' || s === 'side-panel';
export const scaffoldFilesFor = (s, all) => all.filter((f) => (f === 'popup.html' ? hasPopup(s) : f === 'sidepanel.html' ? hasSidePanel(s) : f === 'popup.js' || f === 'popup.css' ? s !== 'none' : true));
export function scaffoldManifest(manifest, wrote) {
    const out = { ...manifest };
    if (wrote.key && typeof out.key !== 'string')
        out.key = wrote.key;
    if (wrote.popup === false) {
        const action = { ...out.action };
        delete action.default_popup;
        out.action = action;
    }
    if (!wrote.sidePanel)
        return out;
    const permissions = Array.isArray(out.permissions) ? [...out.permissions] : [];
    if (!permissions.includes('sidePanel'))
        permissions.push('sidePanel');
    return { ...out, permissions, side_panel: { default_path: 'sidepanel.html' } };
}
export function scaffoldPages(config, surfaces) {
    const popup = surfaces === 'both' || surfaces === 'popup';
    const panel = surfaces === 'both' || surfaces === 'side-panel';
    return config
        .replaceAll('__APP_POPUP__', popup ? 'popup.html' : '')
        .replaceAll('__APP_SIDE_PANEL__', panel ? 'sidepanel.html' : '')
        .replace(/^(\s*)\/\/ __COUNT_OPENS__$/m, (_line, indent) => `${indent}countOpens: false,`)
        .replace(/^(\s*)\/\/ __UNINSTALL_PAGE__$/m, (_line, indent) => `${indent}uninstallPage: true,`)
        .replace(/^(\s*)\/\/ __ACCOUNT_BAR__$/m, (_line, indent) => `${indent}accountBar: true,`);
}
export const fillPages = (text, pages = {}) => text.replaceAll('__APP_POPUP__', pages.appPopup ?? '').replaceAll('__APP_SIDE_PANEL__', pages.appSidePanel ?? '')
    .replace(/^(\s*)\/\/ __COUNT_OPENS__$/m, (_line, indent) => `${indent}countOpens: ${pages.countOpens === false ? 'false' : 'true'},`)
    .replace(/^(\s*)\/\/ __UNINSTALL_PAGE__$/m, (_line, indent) => `${indent}uninstallPage: ${pages.uninstallPage === false ? 'false' : 'true'},`)
    .replace(/^(\s*)\/\/ __ACCOUNT_BAR__$/m, (_line, indent) => `${indent}accountBar: ${pages.accountBar === false ? 'false' : 'true'},`);
export const accountBarIn = (config) => !/^\s*accountBar:\s*false\b/m.test(config ?? '');
export const ACCOUNT_BAR_OPEN = "<!-- toolaby: account bar. Toolaby's line at the foot of this page, written by `npx -y toolaby@latest wire` and `upgrade`; accountBar: false in toolaby.config.js takes it out. -->";
export const ACCOUNT_BAR_CLOSE = '<!-- /toolaby: account bar -->';
const ACCOUNT_BAR_BLOCK = () => /[ \t]*<!-- toolaby: account bar\b[\s\S]*?<!-- \/toolaby: account bar -->[ \t]*\r?\n?/g;
export const accountBarBlock = (codeDir = '', indent = '') => [
    ACCOUNT_BAR_OPEN,
    `<script type="module" src="/${codeDir}toolaby.js"></script>`,
    '<style>body{padding-bottom:44px}</style>',
    '<toolaby-account data-dock style="position:fixed;left:0;right:0;bottom:0;z-index:2147483647"></toolaby-account>',
    ACCOUNT_BAR_CLOSE,
].map((line) => `${indent}${line}\n`).join('');
export function withAccountBar(html, o) {
    const without = html.replace(ACCOUNT_BAR_BLOCK(), '');
    if (!o.keep)
        return { html: without, state: 'out' };
    if (/<toolaby-account\b/i.test(without))
        return { html: without, state: 'own' };
    const close = without.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
    if (close < 0)
        return { html: `${without}${!without || without.endsWith('\n') ? '' : '\n'}${accountBarBlock(o.codeDir)}`, state: 'in' };
    const lineStart = without.lastIndexOf('\n', close - 1) + 1;
    const before = without.slice(lineStart, close);
    if (!/^[ \t]*$/.test(before))
        return { html: `${without.slice(0, close)}\n${accountBarBlock(o.codeDir)}${without.slice(close)}`, state: 'in' };
    const above = without.slice(0, lineStart).replace(/\s+$/, '').split('\n').pop() ?? '';
    const indent = /^[ \t]*/.exec(above)?.[0] ?? '';
    return { html: `${without.slice(0, lineStart)}${accountBarBlock(o.codeDir, indent.length >= before.length ? indent : before)}${without.slice(lineStart)}`, state: 'in' };
}
export const accountBarPages = (kind, pages, has) => kind !== 'plain' ? [] : [...new Set(pages.map((p) => (typeof p === 'string' ? p.trim().replace(/^(\.\/)+/, '').replace(/[?#].*$/, '') : '')).filter((p) => /\.html?$/i.test(p) && !/^toolaby-(popup|sidepanel)\.html$/.test(p) && !p.split('/').includes('..') && has(p)))];
export function importPath(from, codeDir = '') {
    const depth = from.split('/').length - 1;
    const up = depth === 0 ? './' : '../'.repeat(depth);
    return `${up}${codeDir}toolaby.js`;
}
const dep = (pkg, name) => !!(pkg?.dependencies?.[name] || pkg?.devDependencies?.[name]);
const first = (has, candidates) => candidates.find(has) ?? null;
export function detectProject(o) {
    const { has, packageJson: pkg, manifest, site } = o;
    const scripts = pkg?.scripts ?? {};
    const built = !!scripts.build || has('dist') || has('build');
    const wxt = dep(pkg, 'wxt') || !!first(has, ['wxt.config.ts', 'wxt.config.js', 'wxt.config.mts', 'wxt.config.mjs']);
    const plasmo = dep(pkg, 'plasmo');
    const crxjs = dep(pkg, '@crxjs/vite-plugin');
    if (wxt) {
        const src = !has('entrypoints') && has('src/entrypoints') ? 'src/' : '';
        const worker = first(has, [`${src}entrypoints/background.ts`, `${src}entrypoints/background.js`, `${src}entrypoints/background/index.ts`, `${src}entrypoints/background/index.js`]);
        const popup = first(has, [`${src}entrypoints/popup.html`, `${src}entrypoints/popup/index.html`]);
        const appPopup = popup ? 'popup.html' : null;
        const sidePanel = first(has, [`${src}entrypoints/sidepanel.html`, `${src}entrypoints/sidepanel/index.html`]);
        const appSidePanel = sidePanel ? 'sidepanel.html' : null;
        const workerFile = worker ?? `${src}entrypoints/background.ts`;
        const workerLines = `import { toolaby } from '${importPath(workerFile)}';\n\nexport default defineBackground(() => {\n  toolaby.startBackground();\n});\n`;
        return {
            kind: 'wxt', label: 'WXT', codeDir: '', popupDir: '', manifestFile: null, wrapper: true, worker, built: false, foundManifest: null,
            ...(o.ownInFront ? { appPopup: null, appSidePanel: null, ownPopup: appPopup, ownSidePanel: appSidePanel } : { appPopup, appSidePanel }),
            createWorker: null,
            workerLines, snippets: [],
            extraFiles: [{ from: 'toolaby.wxt.ts', to: 'modules/toolaby.wxt.ts' }, { from: 'toolaby.background.js', to: 'toolaby.background.js' }],
        };
    }
    if (plasmo) {
        const src = has('src') && !first(has, ['popup.tsx', 'popup.html', 'background.ts', 'background.js']) ? 'src/' : '';
        const worker = first(has, [`${src}background.ts`, `${src}background.js`, `${src}background/index.ts`, `${src}background/index.js`]);
        const workerFile = worker ?? `${src}background.ts`;
        const workerLines = `import { toolaby } from '${importPath(workerFile)}';\n\ntoolaby.startBackground();\n`;
        const code = JSON.stringify({ manifest: { ...(o.manifestKey ? { key: o.manifestKey } : {}), permissions: ['storage'], externally_connectable: { matches: [sitePattern(site)] } } }, null, 2).replace(/^\{\n|\n\}$/g, '');
        return {
            kind: 'plasmo', label: 'Plasmo', codeDir: '', popupDir: '', manifestFile: null, wrapper: false, appPopup: null, appSidePanel: null, worker, built: false, foundManifest: null,
            createWorker: worker ? null : { file: workerFile, content: workerLines },
            workerLines, snippets: [{ file: 'package.json', language: 'json', code }],
            note: 'Plasmo builds only the pages its manifest names, so Toolaby\'s popup cannot stand in front of yours: ask the gate in your popup — the lines are in the docs, under Plasmo.',
        };
    }
    if (crxjs && !has('manifest.json')) {
        const configFile = first(has, ['manifest.config.ts', 'manifest.config.js', 'manifest.ts', 'manifest.js', 'src/manifest.ts', 'src/manifest.js']);
        const source = o.manifestSource ?? '';
        const declared = source.match(/default_popup:\s*['"]([^'"\\\r\n]+)['"]/)?.[1] ?? null;
        const ownPopup = declared && declared !== 'toolaby-popup.html' ? declared : null;
        const declaredPanel = source.match(/default_path:\s*['"]([^'"\\\r\n]+)['"]/)?.[1] ?? null;
        const ownSidePanel = declaredPanel && declaredPanel !== 'toolaby-sidepanel.html' ? declaredPanel : null;
        const appPopup = o.ownInFront ? null : ownPopup;
        const appSidePanel = o.ownInFront ? null : ownSidePanel;
        const worker = source.match(/service_worker:\s*['"]([^'"\\\r\n]+)['"]/)?.[1] ?? first(has, ['src/background.ts', 'src/background.js', 'background.ts', 'background.js']);
        const workerFile = worker ?? 'src/background.ts';
        const workerLines = `import { toolaby } from '${importPath(workerFile)}';\n\ntoolaby.startBackground();\n`;
        const code = [
            `// ${configFile ?? 'manifest.config.ts'} — Toolaby's needs come from toolaby.config.js: import once, spread inside defineManifest({ … })`,
            `import { manifest as toolaby } from '${importPath(configFile ?? 'manifest.config.ts').replace(/toolaby\.js$/, 'toolaby.manifest.js')}';`,
            ``,
            `...toolaby, // the extension's id, the storage permission, Toolaby's address`,
            ...(appPopup ? [`action: { default_popup: 'toolaby-popup.html' },`] : []),
            ...(appSidePanel ? [`side_panel: { default_path: 'toolaby-sidepanel.html' }, // and 'sidePanel' among the permissions`] : []),
            ...(worker ? [] : [`background: { service_worker: '${workerFile}', type: 'module' },`]),
        ].join('\n');
        const viteFile = first(has, ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']) ?? 'vite.config.ts';
        const inputs = [appPopup ? `popup: '${appPopup}'` : null, appSidePanel ? `sidepanel: '${appSidePanel}'` : null].filter(Boolean).join(', ');
        const vite = [
            `// ${viteFile} — CRXJS builds only the pages the manifest names: this keeps ${appPopup && appSidePanel ? 'your popup and side panel' : appSidePanel ? 'your side panel' : 'your popup'} built, for Toolaby's to hand over to`,
            `export default defineConfig({`,
            `  plugins: [crx({ manifest })],`,
            `  build: { rollupOptions: { input: { ${inputs} } } },`,
            `});`,
        ].join('\n');
        return {
            kind: 'crxjs', label: 'CRXJS', codeDir: '', popupDir: '', manifestFile: null, wrapper: true, appPopup, appSidePanel, worker: worker && has(worker) ? worker : null, built: false, foundManifest: null,
            ...(o.ownInFront ? { ownPopup, ownSidePanel } : {}),
            createWorker: worker && has(worker) ? null : { file: workerFile, content: workerLines },
            workerLines, snippets: [{ file: configFile ?? 'manifest.config.ts', language: 'ts', code }, ...(appPopup || appSidePanel ? [{ file: viteFile, language: 'ts', code: vite }] : [])],
        };
    }
    if (has('manifest.json')) {
        const declared = typeof manifest?.action?.default_popup === 'string' ? manifest.action.default_popup : null;
        const declaredPanel = typeof manifest?.side_panel?.default_path === 'string' ? manifest.side_panel.default_path : typeof manifest?.sidebar_action?.default_panel === 'string' ? manifest.sidebar_action.default_panel : null;
        const named = typeof manifest?.background?.service_worker === 'string' ? manifest.background.service_worker.trim().replace(/^(\.\/)+/, '') || null : null;
        const workerFile = named && has(named) ? named : 'background.js';
        return {
            kind: crxjs ? 'crxjs' : 'plain', label: crxjs ? 'CRXJS' : 'a plain extension', codeDir: '', popupDir: '', manifestFile: 'manifest.json', wrapper: true, built: crxjs ? false : built, foundManifest: null,
            appPopup: declared && declared !== 'toolaby-popup.html' ? declared : null, appSidePanel: declaredPanel && declaredPanel !== 'toolaby-sidepanel.html' ? declaredPanel : null, worker: named && has(named) ? named : null, createWorker: null,
            workerLines: `import { toolaby } from '${importPath(workerFile)}';\n\ntoolaby.startBackground();\n`, snippets: [],
        };
    }
    const foundManifest = [...(o.tree ?? [])].filter((p) => p.endsWith('/manifest.json') && !p.includes('node_modules/')).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0] ?? null;
    return { kind: 'unknown', label: 'unknown', codeDir: '', popupDir: '', manifestFile: null, wrapper: false, appPopup: null, appSidePanel: null, worker: null, createWorker: null, workerLines: '', snippets: [], built, foundManifest };
}
