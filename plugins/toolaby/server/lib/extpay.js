// Generated from wall/src/packages/wiring/extpay.ts by wall/scripts/pack-create.mjs — edit there.
import { importPath } from './project.js';
/**
 * ExtensionPay's own library, known by what it is rather than what it is called: it talks to extensionpay.com and
 * defines ExtPay by name, as each of its published forms does. Copied in under a name of the developer's own —
 * extensionpay.js, wired from the wild (1 Oct 2026) — it is still the library, and is switched. ExtensionPay inside
 * anything else is a build's output: in a bundle with the extension's own code around it (fairsky's), or minified under
 * the library's name (a Vite chunk called ExtPay.js). Nothing in a build is switched; its source is.
 */
const NAMED = /(\bvar\s+ExtPay\s*=|\bfunction\s+ExtPay\s*\()/;
const LIBRARY_NAME = /(^|\/)[^/]*ext(ension)?pay[^/]*\.(m?js|cjs)$/i;
/** From npm: the extension's own code, whatever its file is called. */
const IMPORTS_NPM = /(['"])extpay\1/;
/** ExtPay's own object, minified or not: its methods defined, as no code that only calls them does. */
const DEFINES_API = (text) => /\bopenPaymentPage\s*:/.test(text) && /\bstartBackground\s*:/.test(text);
/** Toolaby's classic ExtPay (toolaby-extpay.js), written in place of ExtensionPay's by an earlier move: what it asks, what it sets. */
const isMoved = (f) => /["']toolaby\.getPlans["']/.test(f.text) && /\bself\.ExtPay\s*=/.test(f.text);
const carriesExtPay = (f) => /extensionpay\.com/.test(f.text) && !IMPORTS_NPM.test(f.text) && (NAMED.test(f.text) || /ExtPay setup error/.test(f.text) || DEFINES_API(f.text) || LIBRARY_NAME.test(f.path));
const ID = /[A-Za-z_$][\w$]*/.source;
/** ExtPay's types, imported by name beside it from npm, as toolaby.d.ts names them. */
const TYPES = { User: 'ExtPayUser', Plan: 'ExtPayPlan' };
/** `ExtPay, { type User as U }` from 'extpay' as toolaby.js has them; null where a name is not one of ExtPay's. */
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
/** What switching ExtensionPay to Toolaby changes in these files, or null when the extension does not use it. */
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
            // With ExtPay's types beside it — `import ExtPay, { User as ExtPayUser } from 'extpay'` — or its types alone.
            .replace(new RegExp(`import\\s+(?:(${ID})\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s+(['"])extpay\\3(\\s*;)?`, 'g'), (m, def, names) => {
            const list = namedImports(def, names);
            return list === null ? m : `import { ${list} } from '${to}';`;
        })
            .replace(new RegExp(`import\\s+(${ID})\\s+from\\s+(['"])extpay\\2(\\s*;)?`, 'g'), (_m, name) => `import { ExtPay${name === 'ExtPay' ? '' : ` as ${name}`} } from '${to}';`)
            .replace(new RegExp(`(const|let|var)\\s+(${ID})\\s*=\\s*require\\(\\s*(['"])extpay\\3\\s*\\)(\\.default)?`, 'g'), (_m, kw, name) => `${kw} ${name} = require('${to}').ExtPay`)
            // A content script that only loaded ExtPay for extensionpay.com's pages: nothing to load now.
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
        // The library's own form, from its text: an ES module exports ExtPay, CommonJS assigns it to module.exports, the
        // classic file does neither. The browser polyfill inside the classic one assigns a module.exports of its own, which
        // once made ExtPay.js CommonJS, and every importScripts() of it threw (1 Oct 2026). Loaded by importScripts(), a file
        // is classic whatever it says; imported by a bundler's ES module, the classic one is handed on as a module is.
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
    // Moved before: Toolaby's ExtPay is the platform's own file, and is written again as the others are, asked or not.
    const moved = own.filter(isMoved).map((f) => f.path);
    for (const f of own.filter(isMoved))
        if (o.classic && f.text !== o.classic)
            edits.push({ path: f.path, text: o.classic, why: 'refresh' });
    if (!found && !moved.length && !ids.length)
        return null;
    return { ids, edits, untouched, built, found, moved };
}
const EXTPAY_SITE = /^(\*|https?):\/\/(\*\.)?extensionpay\.com(\/|$)/i;
/** The manifest without what was there for ExtensionPay: its content script on extensionpay.com, its host permission. */
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
// Stripe's units: whole yen and the like, three decimals for a few dinars, two for the rest (packages/money).
const ZERO = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
const THREE = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);
const major = (minor, currency) => (ZERO.has(currency) ? minor : THREE.has(currency) ? minor / 1000 : minor / 100);
/** ExtensionPay's plans as Toolaby's, named by their nicknames so openPaymentPage('pro') still finds its plan. */
export function plansFromExtPay(plans) {
    const make = [];
    const skipped = [];
    for (const p of plans) {
        if (!p || typeof p.unitAmountCents !== 'number' || typeof p.currency !== 'string')
            continue;
        const currency = p.currency.toLowerCase();
        const once = p.interval === 'once';
        // A nickname is what ExtPay's code names the plan by, kept as its tier; a plan without one needs no tier to be found.
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
/** ExtensionPay's public list of an extension's plans: what its own getPlans() reads. */
export const extPayPlansUrl = (id) => `https://extensionpay.com/extension/${encodeURIComponent(id)}/api/v2/current-plans`;
/** A plan as `wire` says it: its nickname, or, without one, what it is. */
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
/** A plan's price alone, as `wire` says it: "$4.99 a month", "$39.00 once". */
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
/** What `wire` found of ExtensionPay itself: the files a move changes, or names to change. */
export const extPayFiles = (s) => [...new Set([...s.edits.filter((e) => e.why !== 'refresh').map((e) => e.path), ...s.untouched, ...s.built])];
/**
 * Why nothing was written: ExtensionPay is here, and moving it was not asked for. The command and the Wire button say it
 * in these words; `how` is how to ask, where it is said.
 */
export function extPayNotAsked(s, how) {
    const files = extPayFiles(s);
    return `This extension sells with ExtensionPay (${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''}). Moving it to Toolaby replaces ExtensionPay's code with Toolaby's, takes its content script out of manifest.json and copies its plans: ${how}. Nothing was written. See toolaby.app/docs/extensionpay.`;
}
/** The rows `wire` says for ExtensionPay: what was switched, what to change by hand, the plans, and the buyers. */
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
    // Said once: with nothing switched, the manifest's change goes with the build's row.
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
        // A plan made by hand before the move, at another price than ExtensionPay's (an agent took prices from a README, 2 Oct
        // 2026): moved subscribers keep their own price, but new buyers pay the tool's. Said, with the way to match it.
        for (const d of p.differs ?? [])
            rows.push({ tone: 'warn', label: 'Plans', text: `${d.name} is ${cost(d.here)} here and ${cost(d.there)} on ExtensionPay: new buyers would pay ${cost(d.here)}. If that is not meant, add it at ExtensionPay's price under the same name and retire this one (\`plan add\`, \`plan retire\`).` });
        if (p.failed.length)
            rows.push({ tone: 'todo', label: 'Plans', text: `Not copied: ${p.failed.map((x) => `${shownName(x)} — ${x.why}`).join('; ')}.` });
        if (p.skipped.length)
            rows.push({ tone: 'warn', label: 'Plans', text: `No match on Toolaby: ${p.skipped.map((x) => `${x.name}, ${x.why}`).join('; ')}.` });
    }
    // The buyers come with the move — by the person's hand, in order, and before the update is published: an agent that
    // moved an extension left the restricted key and Copy to Live out of what it told its person (2 Oct 2026).
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
