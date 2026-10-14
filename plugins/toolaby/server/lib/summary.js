// Generated from wall/src/packages/wiring/summary.ts by wall/scripts/pack-create.mjs — edit there.
import { withoutComments } from './manifest.js';
import { importPath } from './project.js';
export function popupSwapIn(files) {
    for (const f of files) {
        const m = withoutComments(f.text).match(/\b(chrome|browser)\.(action|browserAction)\.(setPopup|getPopup)\s*\(/);
        if (m)
            return { file: f.path, call: `${m[1]}.${m[2]}.${m[3]}()` };
    }
    return null;
}
/**
 * Whether the extension's own code opens the paywall anywhere, outside its comments: gate() or showPaywall(), or a
 * payment page — Toolaby's openPaymentPage(), or ExtensionPay's and its openTrialPage(), which open Toolaby's once
 * switched, called or handed to a listener as it is. Four ExtensionPay extensions with a Buy button were told nothing
 * opened it (1 Oct 2026).
 */
export const gatesIn = (files) => files.some((f) => /\btoolaby\s*\.\s*(gate|showPaywall)\s*\(|\.\s*open(Payment|Trial)Page\b/.test(withoutComments(f.text)));
/**
 * Whether the extension's own code counts its uses: a toolaby.gate() in it (3 Oct 2026). Then an open of the Toolaby
 * popup counts none — toolaby.config.js says `countOpens: false`, and the popup opens on to the extension's page unless
 * the device may not use it at all. With none, the open is the only use there is to count: `countOpens: true`.
 */
export const countsUses = (files) => files.some((f) => /\btoolaby\s*\.\s*gate\s*\(/.test(withoutComments(f.text)));
/** Whether a path is the extension's own code, for popupSwapIn: a script, not Toolaby's, not a dependency's or a build's. */
export const ownCode = (path) => /\.(m?js|jsx|ts|tsx)$/.test(path) && !/(^|\/)toolaby[^/]*$/.test(path) && !/(^|\/)(node_modules|dist|build|\.output|\.wxt|\.plasmo)\//.test(path);
export function wiringSummary(o) {
    const { project: p, wiring: w } = o;
    const rows = [];
    // The popup: Toolaby's in front of the extension's, or theirs in front and Toolaby's beside it, or none at all.
    const ownPopup = w?.ownPopup ?? p.ownPopup ?? null;
    const ownSidePanel = w?.ownSidePanel ?? p.ownSidePanel ?? null;
    // ExtensionPay's extensions keep theirs in front, as they had them: their code says what is paid.
    const asItWas = "as it was with ExtensionPay: your code's ExtPay calls say what is paid, and openPaymentPage() opens Toolaby's paywall. `upgrade --toolaby-popup` puts Toolaby's in front";
    // In front of an ExtensionPay extension, Toolaby's page shows its sign-in and plans only to someone who may not use the
    // extension yet, and an open is never counted: the code's ExtPay calls say what is paid (7 Oct 2026).
    const extPayFrontLine = (page) => `Toolaby's paywall in front of ${page}: its sign-in and plans show when your dashboard says someone can't use the extension yet. Opens are never counted; your ExtPay calls say what is paid`;
    if (o.appPopup) {
        rows.push(o.popupSwap
            ? { tone: 'warn', label: 'Popup', text: `Your code handles the popup itself (${o.popupSwap.call} in ${o.popupSwap.file}), so keep yours in front`, fix: 'own-popup' }
            : { tone: 'ok', label: 'Popup', text: o.extPayFront ? extPayFrontLine(o.appPopup) : `Toolaby checks first, then opens ${o.appPopup}` });
    }
    else if (ownPopup && o.keptForSwap && o.popupSwap)
        rows.push({ tone: 'ok', label: 'Popup', text: `Yours stays in front, as your code handles it (${o.popupSwap.call} in ${o.popupSwap.file})` });
    else if (ownPopup && o.keptForExtPay)
        rows.push({ tone: 'ok', label: 'Popup', text: `Yours stays in front, ${asItWas}` });
    else if (ownPopup)
        rows.push({ tone: 'ok', label: 'Popup', text: `Yours stays in front; toolaby.showPaywall() opens Toolaby's` });
    else if (p.note)
        rows.push({ tone: 'warn', label: 'Popup', text: p.note });
    else if (!o.appSidePanel && !ownSidePanel)
        rows.push({ tone: 'ok', label: 'Popup', text: 'None: Toolaby steps in where your code calls toolaby.gate()' });
    if (o.appSidePanel)
        rows.push({ tone: 'ok', label: 'Side panel', text: o.extPayFront ? extPayFrontLine(o.appSidePanel) : `Toolaby checks first, then opens ${o.appSidePanel}` });
    else if (ownSidePanel)
        rows.push({ tone: 'ok', label: 'Side panel', text: o.keptForExtPay ? `Yours stays in front, ${asItWas}` : `Yours stays in front; toolaby.showPaywall() opens Toolaby's` });
    // Toolaby's line at the foot of the extension's own pages: who is signed in, the free uses left, Upgrade.
    const barPages = (state) => (o.accountBar ?? []).filter((b) => b.state === state).map((b) => b.page).join(' and ');
    if (barPages('in'))
        rows.push({ tone: 'ok', label: 'Account bar', text: `Toolaby's line at the foot of ${barPages('in')}: the sign-in, the free uses left and Upgrade. accountBar: false in toolaby.config.js takes it out` });
    if (barPages('own'))
        rows.push({ tone: 'ok', label: 'Account bar', text: `${barPages('own')} places <toolaby-account> itself` });
    if (barPages('out'))
        rows.push({ tone: 'ok', label: 'Account bar', text: `Kept out of ${barPages('out')}, as toolaby.config.js says (accountBar: false)` });
    // The background: what starts Toolaby.
    if (w) {
        const b = w.background;
        if (b.kind === 'new')
            rows.push({ tone: 'ok', label: 'Background', text: `${b.file} starts Toolaby` });
        else if (b.kind === 'wrap')
            rows.push({ tone: 'ok', label: 'Background', text: `${b.wraps} runs as before, and Toolaby starts with it` });
        else if (b.kind === 'started')
            rows.push({ tone: 'ok', label: 'Background', text: `${b.file} starts Toolaby` });
        else if (b.kind === 'lines')
            rows.push({ tone: 'todo', label: 'Background', text: `Add these 2 lines to the top of ${b.file}:`, code: `import { toolaby } from '${importPath(b.file)}';\n\ntoolaby.startBackground();` });
        else if (b.kind === 'built')
            rows.push({ tone: 'todo', label: 'Background', text: `Your build makes ${b.file}. Add these 2 lines to the top of its source, with the path from there to toolaby.js:`, code: `import { toolaby } from './toolaby.js';\n\ntoolaby.startBackground();` });
        else if (b.kind === 'gone')
            rows.push({ tone: 'todo', label: 'Background', text: `${b.wraps} is no longer in the folder. Put your background's file name in manifest.json:`, code: '"background": { "service_worker": "your-background.js" }', again: true });
        else
            rows.push({ tone: 'todo', label: 'Background', text: `Toolaby can't load a file named "${b.file}". Rename it to ${b.to}, and in manifest.json:`, code: `"background": { "service_worker": "${b.to}" }`, again: true });
    }
    else if (p.extraFiles?.length)
        rows.push({ tone: 'ok', label: 'Background', text: `${p.label} starts Toolaby (${p.extraFiles.map((f) => f.to).join(', ')})` });
    else if (p.createWorker)
        rows.push({ tone: 'ok', label: 'Background', text: `${p.createWorker.file} starts Toolaby` });
    else if (p.worker && !o.workerStarts)
        rows.push({ tone: 'todo', label: 'Background', text: `Add these 2 lines to the top of ${p.worker}:`, code: p.workerLines.trim() });
    else if (p.worker)
        rows.push({ tone: 'ok', label: 'Background', text: `${p.worker} starts Toolaby` });
    // With no page of Toolaby's in front, the paywall opens only where the code asks for it: when nothing does, the lines.
    if (!o.appPopup && !o.appSidePanel && o.gates === false && p.kind === 'plain') {
        rows.push({ tone: 'todo', label: 'Paywall', text: p.built ? 'Nothing opens it yet. Where your paid action starts, add (the import is the path to toolaby.js):' : 'Nothing opens it yet. Where your paid action starts, in a module script, add:', code: `import { toolaby } from '${p.built ? './toolaby.js' : '/toolaby.js'}';\n\nbutton.addEventListener('click', async () => {\n  const permit = await toolaby.gate();\n  if (!permit.allowed) return toolaby.showPaywall(permit);\n  // your paid action\n});` });
    }
    // The manifest: what it gained, or, generated by a framework, what its config needs.
    if (w)
        rows.push({ tone: 'ok', label: 'Manifest', text: w.added.length ? w.added.join(' · ') : 'Has what Toolaby needs' });
    // What it lost that Toolaby no longer needs, said: a host permission an earlier wiring gave Toolaby's address.
    for (const line of w?.unneeded ?? [])
        rows.push({ tone: 'ok', label: 'Manifest', text: `${line[0].toUpperCase()}${line.slice(1)}` });
    for (const sn of p.snippets)
        rows.push({ tone: 'todo', label: 'Manifest', text: `Add to ${sn.file}:`, code: sn.code.trim() });
    // Only where the build copies the folder elsewhere: an esbuild that bundles a script into the folder Chrome loads was
    // told to copy files that were already there, and an agent took it for a step left undone (2 Oct 2026).
    if (p.built && o.buildCopies !== false)
        rows.push({ tone: 'warn', label: 'Build', text: 'Your build must copy every toolaby* file into its output' });
    const steps = rows.filter((r) => r.tone === 'todo').length;
    const todo = steps > 0;
    const doThem = steps > 1 ? 'Do the steps above' : 'Do the step above';
    const reload = p.kind === 'plain' && !p.built ? 'reload it in chrome://extensions' : 'build it (or start the dev server), then reload it in chrome://extensions';
    const next = rows.some((r) => r.again)
        ? `${doThem}, then wire again.`
        : `${todo ? `${doThem}, then ${reload}` : reload.charAt(0).toUpperCase() + reload.slice(1)}. The Set up page turns green when it checks in.`;
    return { rows, todo, next };
}
