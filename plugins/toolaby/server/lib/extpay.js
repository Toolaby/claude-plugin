// Generated from Toolaby's wiring rules: do not edit by hand.
import { importPath } from './project.js';
const NAMED = /(\bvar\s+ExtPay\s*=|\bfunction\s+ExtPay\s*\()/;
const LIBRARY_NAME = /(^|\/)[^/]*ext(ension)?pay[^/]*\.(m?js|cjs)$/i;
const IMPORTS_NPM = /(['"])extpay\1/;
const DEFINES_API = (text) => /\bopenPaymentPage\s*:/.test(text) && /\bstartBackground\s*:/.test(text);
const isMoved = (f) => /["']toolaby\.getPlans["']/.test(f.text) && /\bself\.ExtPay\s*=/.test(f.text);
const carriesExtPay = (f) => /extensionpay\.com/.test(f.text) && !IMPORTS_NPM.test(f.text) && (NAMED.test(f.text) || /ExtPay setup error/.test(f.text) || DEFINES_API(f.text) || LIBRARY_NAME.test(f.path));
const ID = /[A-Za-z_$][\w$]*/.source;
const TYPES = { User: 'ExtPayUser', Plan: 'ExtPayPlan' };
function namedImports(def, names) {
    const parts = [];
    for (const raw of names.split(',').map((x) => x.trim()).filter(Boolean)) {
        const m = raw.match(new RegExp(`^(type\\s+)?(${ID})(?:\\s+as\\s+(${ID}))?$`));
        const ours = m && TYPES[m[2]];
        if (!m || !ours)
            return null;
        const local = m[3] ?? m[2];
        parts.push(`${m[1] ? 'type ' : ''}${ours}${local === ours ? '' : ` as ${local}`}`);
    }
    return [...(def ? [`ExtPay${def === 'ExtPay' ? '' : ` as ${def}`}`] : []), ...parts].join(', ');
}
export function switchExtPay(files, o) {
    const library = files.filter(carriesExtPay);
    const vendored = library.filter((f) => LIBRARY_NAME.test(f.path) && NAMED.test(f.text));
    const built = library.filter((f) => !vendored.includes(f)).map((f) => f.path);
    const own = files.filter((f) => !vendored.includes(f));
    const edits = [];
    const untouched = [];
    const ids = [];
    for (const f of own) {
        for (const m of f.text.matchAll(/\bExtPay\s*\(\s*(['"])([\w.-]+)\1\s*\)/g))
            if (!ids.includes(m[2]))
                ids.push(m[2]);
        if (built.includes(f.path) || !/(['"])extpay\1/.test(f.text))
            continue;
        const to = importPath(f.path, o.codeDir);
        const text = f.text
            .replace(new RegExp(`import\\s+(?:(${ID})\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s+(['"])extpay\\3(\\s*;)?`, 'g'), (m, def, names) => {
            const list = namedImports(def, names);
            return list === null ? m : `import { ${list} } from '${to}';`;
        })
            .replace(new RegExp(`import\\s+(${ID})\\s+from\\s+(['"])extpay\\2(\\s*;)?`, 'g'), (_m, name) => `import { ExtPay${name === 'ExtPay' ? '' : ` as ${name}`} } from '${to}';`)
            .replace(new RegExp(`(const|let|var)\\s+(${ID})\\s*=\\s*require\\(\\s*(['"])extpay\\3\\s*\\)(\\.default)?`, 'g'), (_m, kw, name) => `${kw} ${name} = require('${to}').ExtPay`)
            .replace(/^[ \t]*import\s+(['"])extpay\1\s*;?[ \t]*\r?\n?/gm, '')
            .replace(/^[ \t]*require\(\s*(['"])extpay\1\s*\)\s*;?[ \t]*\r?\n?/gm, '');
        if (text !== f.text)
            edits.push({ path: f.path, text, why: 'import' });
        if (/(['"])extpay\1/.test(text))
            untouched.push(f.path);
    }
    for (const f of vendored) {
        const name = f.path.split('/').pop();
        const to = importPath(f.path, o.codeDir);
        const stem = name.replace(/\.(m?js|cjs)$/i, '').replace(/\./g, '\\.');
        const exportsModule = /(^|[\s;}])export\s*(default\b|\{)/m.test(f.text);
        const loadedClassic = own.some((g) => new RegExp(`importScripts\\([^)]*(['"])[^'"]*${stem}\\.m?js\\1`, 'i').test(g.text));
        const common = !loadedClassic && !exportsModule && /\bmodule\.exports\s*=\s*ExtPay\b/.test(f.text);
        const asModule = !loadedClassic && (exportsModule || own.some((g) => new RegExp(`from\\s+(['"])[^'"]*${stem}(\\.m?js)?\\1`, 'i').test(g.text)));
        if (common)
            edits.push({ path: f.path, text: `// ExtensionPay's calls, answered by Toolaby (toolaby.app/docs/extensionpay).\nmodule.exports = require('${to}').ExtPay;\n`, why: 'common' });
        else if (asModule)
            edits.push({ path: f.path, text: `// ExtensionPay's calls, answered by Toolaby (toolaby.app/docs/extensionpay).\nexport { ExtPay as default, ExtPay } from '${to}';\n`, why: 'module' });
        else if (o.classic)
            edits.push({ path: f.path, text: o.classic, why: 'classic' });
        else
            untouched.push(f.path);
    }
    const found = vendored.length > 0 || built.length > 0 || edits.length > 0 || untouched.length > 0;
    const moved = own.filter(isMoved).map((f) => f.path);
    for (const f of own.filter(isMoved))
        if (o.classic && f.text !== o.classic)
            edits.push({ path: f.path, text: o.classic, why: 'refresh' });
    if (!found && !moved.length && !ids.length)
        return null;
    return { ids, edits, untouched, built, found, moved };
}
const EXTPAY_SITE = /^(\*|https?):\/\/(\*\.)?extensionpay\.com(\/|$)/i;
export function withoutExtPay(manifest) {
    const m = structuredClone(manifest);
    let changed = false;
    if (Array.isArray(m.content_scripts)) {
        const kept = m.content_scripts.flatMap((cs) => {
            const matches = Array.isArray(cs?.matches) ? cs.matches : [];
            const rest = matches.filter((p) => !(typeof p === 'string' && EXTPAY_SITE.test(p)));
            if (rest.length === matches.length)
                return [cs];
            changed = true;
            return rest.length ? [{ ...cs, matches: rest }] : [];
        });
        if (kept.length)
            m.content_scripts = kept;
        else
            delete m.content_scripts;
    }
    for (const key of ['permissions', 'host_permissions', 'optional_host_permissions']) {
        const list = m[key];
        if (!Array.isArray(list))
            continue;
        const rest = list.filter((p) => !(typeof p === 'string' && EXTPAY_SITE.test(p)));
        if (rest.length !== list.length) {
            changed = true;
            m[key] = rest;
        }
    }
    return { manifest: changed ? m : manifest, changed };
}
const ZERO = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const THREE = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);
const major = (minor, currency) => (ZERO.has(currency) ? minor : THREE.has(currency) ? minor / 1000 : minor / 100);
export function plansFromExtPay(plans) {
    const make = [];
    const skipped = [];
    for (const p of plans) {
        if (!p || typeof p.unitAmountCents !== 'number' || typeof p.currency !== 'string')
            continue;
        const currency = p.currency.toLowerCase();
        const once = p.interval === 'once';
        const nickname = (p.nickname ?? '').trim();
        const shown = nickname || (once ? 'Lifetime' : p.interval === 'year' ? 'Yearly' : 'Monthly');
        if (!once && p.interval !== 'month' && p.interval !== 'year') {
            skipped.push({ name: shown, why: `billed every ${String(p.interval)}` });
            continue;
        }
        if (!once && (p.intervalCount ?? 1) !== 1) {
            skipped.push({ name: shown, why: `billed every ${p.intervalCount} ${p.interval}s, and Toolaby bills monthly or yearly` });
            continue;
        }
        make.push({ billing: once ? 'one_time' : 'subscription', interval: p.interval === 'year' ? 'year' : 'month', amount: major(p.unitAmountCents, currency), currency, ...(nickname ? { name: nickname } : {}) });
    }
    return { make, skipped };
}
export const extPayPlansUrl = (id) => `https://extensionpay.com/extension/${encodeURIComponent(id)}/api/v2/current-plans`;
export const shownName = (p) => p.name ?? (p.billing === 'one_time' ? 'Lifetime' : p.interval === 'year' ? 'Yearly' : 'Monthly');
const price = (p) => {
    let money;
    try {
        money = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency.toUpperCase() }).format(p.amount);
    }
    catch {
        money = `${p.amount} ${p.currency.toUpperCase()}`;
    }
    return `${shownName(p)} (${money}${p.billing === 'one_time' ? ' once' : p.interval === 'year' ? ' a year' : ' a month'})`;
};
const cost = (p) => {
    let money;
    try {
        money = new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency.toUpperCase() }).format(p.amount);
    }
    catch {
        money = `${p.amount} ${p.currency.toUpperCase()}`;
    }
    return `${money}${p.billing === 'one_time' ? ' once' : p.interval === 'year' ? ' a year' : ' a month'}`;
};
export const extPayFiles = (s) => [...new Set([...s.edits.filter((e) => e.why !== 'refresh').map((e) => e.path), ...s.untouched, ...s.built])];
export function extPayNotAsked(s, how) {
    const files = extPayFiles(s);
    return `This extension sells with ExtensionPay (${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''}). Moving it to Toolaby replaces ExtensionPay's code with Toolaby's, takes its content script out of manifest.json and copies its plans: ${how}. Nothing was written. See toolaby.app/docs/extensionpay.`;
}
export function extPayRows(s, o) {
    const rows = [];
    const list = (paths) => paths.join(', ');
    const manifest = o.manifestChanged ? " Its content script on extensionpay.com is gone from manifest.json." : o.ownManifest ? '' : ' Take its content script on extensionpay.com out of your manifest settings.';
    const moved = s.edits.filter((e) => e.why !== 'refresh');
    const refreshed = s.edits.filter((e) => e.why === 'refresh');
    if (moved.length) {
        rows.push({ tone: 'ok', label: 'ExtensionPay', text: `Its calls now answer from Toolaby, your code as it was: ${list(moved.map((e) => e.path))}.${manifest}${o.usesNpm ? ' `npm uninstall extpay` when you like.' : ''}` });
    }
    if (refreshed.length)
        rows.push({ tone: 'ok', label: 'ExtensionPay', text: `Toolaby's ExtPay brought up to date: ${list(refreshed.map((e) => e.path))}.` });
    if (s.untouched.length)
        rows.push({ tone: 'todo', label: 'ExtensionPay', text: `Change by hand: ${list(s.untouched)} — import ExtPay from toolaby.js there (toolaby.app/docs/extensionpay).` });
    if (s.built.length)
        rows.push({ tone: 'todo', label: 'ExtensionPay', text: `Built into ${list(s.built)}: wire the source it is built from, where it imports ExtPay, then build again (toolaby.app/docs/extensionpay).${moved.length ? '' : manifest}` });
    const p = o.plans;
    if (p?.error)
        rows.push({ tone: 'todo', label: 'Plans', text: `${p.error}. Make them on Pricing, each named by its ExtensionPay nickname.` });
    else if (p?.live)
        rows.push({ tone: 'todo', label: 'Plans', text: "ExtensionPay's plans are copied on Test: wire there first, then Set up → Copy to Live." });
    else if (p) {
        if (p.made.length)
            rows.push({ tone: 'ok', label: 'Plans', text: `Copied from ExtensionPay: ${p.made.map(price).join(', ')}.` });
        if (p.had.length)
            rows.push({ tone: 'ok', label: 'Plans', text: `Already here: ${p.had.map(shownName).join(', ')}.` });
        for (const d of p.differs ?? [])
            rows.push({ tone: 'warn', label: 'Plans', text: `${d.name} is ${cost(d.here)} here and ${cost(d.there)} on ExtensionPay: new buyers would pay ${cost(d.here)}. If that is not meant, add it at ExtensionPay's price under the same name and retire this one (\`plan add\`, \`plan retire\`).` });
        if (p.failed.length)
            rows.push({ tone: 'todo', label: 'Plans', text: `Not copied: ${p.failed.map((x) => `${shownName(x)} — ${x.why}`).join('; ')}.` });
        if (p.skipped.length)
            rows.push({ tone: 'warn', label: 'Plans', text: `No match on Toolaby: ${p.skipped.map((x) => `${x.name}, ${x.why}`).join('; ')}.` });
    }
    if (s.found) {
        rows.push({ tone: 'todo', label: 'Buyers', text: "Five steps of yours, in this order, before you publish this update — tell your person each one (toolaby.app/docs/move-subscriptions):" });
        rows.push({ tone: 'todo', label: 'Buyers', text: `1. Copy to Live: \`npx -y toolaby@latest copy-to-live ${o.slug ?? '<tool-id>'}\` (signed in on Live once: \`login --live\`), then \`upgrade ${o.slug ?? '<tool-id>'} --live\` and build.` });
        rows.push({ tone: 'todo', label: 'Buyers', text: "2. Copy the customers: in the Stripe Dashboard ExtensionPay charged on, copy them to the account Toolaby sells on (cards come with them)." });
        rows.push({ tone: 'todo', label: 'Buyers', text: "3. A restricted key on that old account: Subscriptions Write; Customers, Invoices, PaymentMethods, Coupons and Products Read; nothing else." });
        rows.push({ tone: 'todo', label: 'Buyers', text: "4. Move the subscriptions: on Live, the tool's Import → From another Stripe account, with that key — Check the key, Read the old account, Move them. Same price and renewal day; nobody is charged twice." });
        rows.push({ tone: 'todo', label: 'Buyers', text: '5. One-time buyers: a CSV of their addresses, on the same Import page (toolaby.app/docs/extensionpay#buyers).' });
    }
    return rows;
}
