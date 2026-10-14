// What `check` reads in an extension's files: the tool keys a build carries wherever its bundler put them, the scripts
// its pages load and how, the code its background runs. Read from inside the folder only, never through a link, a file
// no larger than readText reads (lib/safe.js).
import { readdirSync, lstatSync } from 'node:fs';
import { join, relative, dirname, posix, sep } from 'node:path';
import { readText } from './safe.js';
import { withoutComments } from './manifest.js';

export const TOOL_KEYS = /tk_(test|live|dev)_[A-Za-z0-9_-]{20,}/g;
const NEVER = new Set(['node_modules', '.git']);

/** A tool key's facts: its side, Toolaby's address in it, the tool id; null for a string that is none. */
export function decodeKey(key) {
  try {
    const [, mode, body] = /^tk_(test|live|dev)_([A-Za-z0-9_-]+)$/.exec(key) ?? [];
    if (!body) return null;
    const facts = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof facts.s === 'string' && typeof facts.t === 'string' ? { mode, site: facts.s.replace(/\/$/, ''), slug: facts.t, x: facts.k?.x, y: facts.k?.y } : null;
  } catch { return null; }
}

/** Every file in a folder, as paths from it with forward slashes: no link followed, no node_modules, a bounded number. */
export function filesOf(root, { depth = 8, max = 5000 } = {}) {
  const out = [];
  const walk = (dir, left) => {
    let names; try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (out.length >= max) return;
      if (NEVER.has(name)) continue;
      const p = join(dir, name);
      let st; try { st = lstatSync(p); } catch { continue; }
      if (st.isDirectory()) { if (left > 0) walk(p, left - 1); } else if (st.isFile()) out.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(root, depth);
  return out;
}

const read = (root, rel) => { try { return readText(join(root, rel)); } catch { return null; } };

/** The tool keys a build carries, each with the files it is in. */
export function keysIn(root, files) {
  const found = new Map();
  for (const f of files) {
    if (!/\.(m?js|html|json)$/.test(f)) continue;
    const text = read(root, f);
    if (!text) continue;
    for (const [k] of text.matchAll(TOOL_KEYS)) { if (!found.has(k)) found.set(k, []); if (!found.get(k).includes(f)) found.get(k).push(f); }
  }
  return found;
}

/** Whether a folder is a framework's or a bundler's output by its place: .output/…, dist, build, build/chrome-mv3-…. */
export function isBuildOutput(dir) {
  const parts = dir.split(sep).filter(Boolean);
  const [last, parent] = [parts.at(-1), parts.at(-2)];
  return parent === '.output' || last === 'dist' || last === 'build' || (parent === 'build' && /^(chrome|firefox|edge|opera|brave|safari)-mv\d/.test(last ?? ''));
}

/** Whether a build is the one for the store by its place: WXT's and Plasmo's production folders (not -dev). */
export const isStoreBuild = (dir) => { const parts = dir.split(sep).filter(Boolean); const [last, parent] = [parts.at(-1) ?? '', parts.at(-2)]; return (parent === '.output' && /-mv\d$/.test(last)) || (parent === 'build' && /-prod$/.test(last)); };

/**
 * A static import or export in a script, outside its comments: what a classic script cannot hold. Chrome stops it at
 * the first one ("Cannot use import statement outside a module"), and a page whose script never ran is a blank popup.
 * `import(…)`, a dynamic import, works in a classic script and is not one.
 */
const MODULE_SYNTAX = /(?:^|[\n;}])\s*(?:import\b\s*(?:['"]|[\w$*{][^;'"()]{0,300}?\bfrom\s*['"])|export\b\s*(?:\{|\*|(?:default|const|let|var|function|class|async)\b))/;
/** What a script imports by its specifier, outside comments: `from './x.js'`, `import './x.js'`. */
const SPECIFIERS = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"\n]+)['"]/g;

/** The line a position in a text is on, from 1. */
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

/**
 * Pages that load a script with module syntax as a classic one — no type="module" — each with the script, the line of
 * its tag, and whether it imports toolaby.js. Every HTML file in the folder, the extension's own pages and others.
 */
export function classicModules(root, files) {
  const found = [];
  for (const page of files.filter((f) => /\.html?$/i.test(f))) {
    const html = read(root, page);
    if (!html) continue;
    const bare = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' '));
    for (const m of bare.matchAll(/<script\b([^>]*)>/gi)) {
      const attrs = m[1];
      const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const kind = (type?.[1] ?? type?.[2] ?? type?.[3] ?? '').trim().toLowerCase();
      if (!src || (kind && !['text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript'].includes(kind))) continue;
      const path = (src[1] ?? src[2] ?? src[3] ?? '').split(/[?#]/)[0];
      if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) continue;
      const rel = path.startsWith('/') ? posix.normalize(path.slice(1)) : posix.normalize(posix.join(posix.dirname(page), path));
      if (rel.startsWith('..')) continue;
      const code = read(root, rel);
      if (!code) continue;
      const text = withoutComments(code);
      if (!MODULE_SYNTAX.test(text)) continue;
      const toolaby = [...text.matchAll(SPECIFIERS)].some(([, s]) => /(^|\/)toolaby(\.js)?$/.test(s));
      found.push({ page, script: rel, line: lineAt(html, m.index), toolaby });
    }
  }
  return found;
}

/**
 * The code a built background runs: its file, and every file of the folder it imports or loads with importScripts(),
 * followed from there. Returns the files and their text joined.
 */
export function workerCode(root, entry, limit = 60) {
  const seen = new Set();
  const texts = [];
  const visit = (rel) => {
    if (seen.size >= limit || seen.has(rel)) return;
    seen.add(rel);
    const text = read(root, rel);
    if (text === null) return;
    texts.push(text);
    const code = withoutComments(text);
    const next = [...code.matchAll(SPECIFIERS)].map((m) => m[1]);
    for (const m of code.matchAll(/importScripts\s*\(([^)]*)\)/g)) for (const s of m[1].matchAll(/['"]([^'"\n]+)['"]/g)) next.push(s[1]);
    for (const s of next) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) continue;
      const to = s.startsWith('/') ? posix.normalize(s.slice(1)) : posix.normalize(posix.join(posix.dirname(rel), s));
      if (!to.startsWith('..')) visit(to);
    }
  };
  visit(posix.normalize(entry.replace(/^\.\//, '')));
  return { files: [...seen], text: texts.join('\n') };
}

/** Whether code carries Toolaby's client: the names of the questions its background answers. */
export const carriesClient = (text) => /["'`]toolaby\.getUser["'`]/.test(text) && /["'`]toolaby\.config["'`]/.test(text);

/** The nearest folder above `dir`, three at most, with a package.json: the project a build came from. */
export function projectAbove(dir, exists) {
  for (let up = dirname(dir), i = 0; i < 3 && up !== dirname(up); up = dirname(up), i++) if (exists(join(up, 'package.json'))) return up;
  return null;
}
