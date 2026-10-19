// What this command will not do, whoever asks: write outside the project it was pointed at, write a file of a new
// extension it does not know, open a sign-in page that is not Toolaby's, put a private file in a store zip, print a
// line it did not write, ask whatever address a project names, or take a download or wait for a sign-in without end.
//
// Each of these took someone else's word. A cloned repository's manifest named the file `wire` wrote — a service
// worker at "../../.zshrc" overwrote the shell's startup file — and a link in the folder took a write wherever it
// pointed. Toolaby's list of a new extension's files was joined to the folder as it came, so a Toolaby server at another
// address (--server, TOOLABY_SERVER) could write any file with any content. And on Windows the sign-in address went
// through cmd.exe, where an `&` in it ran a command. Hand-written, unlike manifest.js and project.js: this is the
// command's own boundary, not a wiring rule the browser shares.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { brotliDecompressSync, gunzipSync, inflateRawSync, inflateSync, constants as zlibConstants } from 'node:zlib';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';

/**
 * The minimal extension's own files, as Toolaby names them (its own list of
 * them; a test keeps the two equal): the only names `create` accepts from Toolaby's list, which says which of them to
 * write and never where. A name Toolaby adds later is refused by a command that predates it — nothing is written,
 * and `npm install -g toolaby@latest` is the way on.
 */
export const SCAFFOLD_FILES = ['manifest.json', 'background.js', 'popup.html', 'sidepanel.html', 'popup.css', 'popup.js', 'README.md'];

/**
 * Where `rel` lands inside `root` — `{ path }` — or why it may not — `{ why }`. Refused: an absolute path, a `..`,
 * a backslash on POSIX (there it is part of a name, not a separator), anything that resolves outside the folder,
 * and a symbolic link at any step below the root, dangling or not: a link in a cloned repository points wherever
 * its author chose, and writing through it writes there. The root itself is the developer's to choose.
 */
export function inside(root, rel) {
  if (typeof rel !== 'string' || !rel.trim() || rel.includes('\0')) return { why: 'it is not a file name' };
  if (isAbsolute(rel) || posix.isAbsolute(rel) || win32.isAbsolute(rel)) return { why: 'it is an absolute path' };
  if (sep === '/' && rel.includes('\\')) return { why: 'it has a backslash in it' };
  if (rel.split(/[\\/]/).includes('..')) return { why: 'it has ".." in it' };
  const base = resolve(root);
  const path = resolve(base, rel);
  if (!path.startsWith(base + sep)) return { why: 'it is outside the folder' };
  let at = base;
  for (const part of relative(base, path).split(sep)) {
    at = join(at, part);
    let st;
    try { st = lstatSync(at); } catch { break; } // not there yet, and so nothing below it is
    if (st.isSymbolicLink()) return { why: `${relative(base, at).split(sep).join('/')} is a symbolic link` };
  }
  return { path };
}

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$|\.localhost$/i;

/**
 * A value from a Toolaby server's answer or a project's file, as one line. Every line leaves without terminal controls (bin.mjs),
 * but keeps its line breaks, which the command's own messages need — so a tool name with "\n✓ Ready to publish" in it
 * printed a whole line of its own, under the command's real ones (25 Sep 2026). Each such value goes through this
 * where it is put into a line: line breaks and tabs, and any run of space, are one space.
 */
export const oneLine = (value) => String(value).replace(/\s+/g, ' ').slice(0, 500);

/** An address a Toolaby server answers on: https, or http on this machine, for a Toolaby server on the developer's laptop. */
const wallScheme = (url) => url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.test(url.hostname));

/**
 * Toolaby a tool key names, when `check` may ask it anything: an origin, https or on this machine, with nothing after
 * it but Test's `/test`, where Test shares Live's hosts — no other path, no query, no credentials, no other scheme.
 * Null otherwise. The key is read from the project's own toolaby.config.js, and a
 * cloned project's key sent `check`'s requests wherever it named: a server inside the developer's network, any path on
 * any host (25 Sep 2026).
 */
export function keySite(site) {
  let url;
  try { url = new URL(site); } catch { return null; }
  const path = url.pathname === '/' ? '' : url.pathname;
  return (path === '' || path === '/test') && `${url.origin}${path}` === site && wallScheme(url) ? site : null;
}

/**
 * A GET that cannot run away with the command: the body read up to `limit` bytes and no further, the whole within `ms`,
 * and a redirect followed — five at most — only to an address a Toolaby server answers on. Answers `{ status, ok, body }`, the
 * body null when it passed the limit; throws as fetch does, and with a TimeoutError when the time runs out. A Toolaby server at
 * another address (--server, TOOLABY_SERVER) could send `create` an icon without end, which the new folder took until the
 * disk was full; and an https address that redirected took `check` anywhere (25 Sep 2026).
 */
export async function fetchBounded(url, { limit = 1024 * 1024, ms = 30_000 } = {}) {
  const signal = AbortSignal.timeout(ms);
  const origin = new URL(url).origin;
  let res = await fetch(url, { redirect: 'manual', signal });
  for (let hops = 0; hops < 5 && res.status >= 300 && res.status < 400 && res.headers.get('location'); hops++) {
    const next = new URL(res.headers.get('location'), url);
    // Within the address asked, and no further: an https Toolaby server that redirected sent `check` to a service on this
    // machine, whose answer it printed as the tool's (25 Sep 2026).
    if (next.origin !== origin || !wallScheme(next)) break;
    await res.body?.cancel().catch(() => {});
    url = next.href;
    res = await fetch(url, { redirect: 'manual', signal });
  }
  return { status: res.status, ok: res.ok, body: await readBounded(res, limit) };
}

/**
 * A response's body, up to `limit` bytes and no further: null past it, and the rest let go of unread. What a server
 * sends is read as it comes, so one that answered without end filled the command's memory — `fetchBounded`'s
 * downloads, and every answer of a Toolaby server at another address (--server, TOOLABY_SERVER), which the MCP server also handed
 * on to an agent (25 Sep 2026).
 */
export async function readBounded(res, limit) {
  if (Number(res.headers.get('content-length')) > limit) { await res.body?.cancel().catch(() => {}); return null; }
  const chunks = [];
  let size = 0;
  const reader = res.body?.getReader();
  for (;;) {
    const { done, value } = reader ? await reader.read() : { done: true };
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Where Test sits under Live's own addresses: `toolaby.app/test` (Toolaby's packages/zone). */
const TEST_PATH = '/test';
const under = (path, base) => path === base || path.startsWith(`${base}/`);

/**
 * Whether an address is Toolaby's: its origin, and for a Toolaby server under a path, that path. Test sits under Live's origin
 * at /test, so an origin no longer tells the two apart: a Toolaby server with no path of its own takes nothing under /test for
 * itself, and one under /test nothing outside it — each side's session goes to its own side alone (29 Sep 2026).
 */
export function withinWall(address, wall) {
  let page; let home;
  try { page = new URL(address); home = new URL(wall); } catch { return false; }
  if (page.origin !== home.origin) return false;
  const base = home.pathname.replace(/\/+$/, '');
  return base ? under(page.pathname, base) : !under(page.pathname, TEST_PATH);
}

/**
 * A request that follows a redirect only within the address it asked — a Toolaby server moving a page on its own host — and
 * refuses one elsewhere: fetch drops the session on the way, but the command took whatever the other address answered
 * for Toolaby's word, and the MCP server handed an agent a page from any host (25 Sep 2026). With `wall`, only within
 * that Toolaby server (withinWall): the same headers go on each hop, the session among them, and Test and Live share an origin.
 *
 * And one that gives up at its time: the answer, redirects and body alike — read or not yet — within `ms` of asking, or
 * a TimeoutError, as fetchBounded's. Bounded in size alone, a Toolaby server that answered a byte at a time held `login`, `wire`
 * and the MCP server for ever (round 8, 25 Sep 2026).
 */
export async function fetchHere(url, { ms = 30_000, wall = null, ...init } = {}) {
  const signal = AbortSignal.timeout(ms);
  const home = wall ?? new URL(url).origin;
  let res = await fetch(url, { ...init, redirect: 'manual', signal });
  for (let hops = 0; hops < 5 && res.status >= 300 && res.status < 400 && res.headers.get('location'); hops++) {
    const next = new URL(res.headers.get('location'), url);
    await res.body?.cancel().catch(() => {});
    if (!withinWall(next.href, home)) throw new Error(`it answered with a redirect to ${next.origin}${next.origin === new URL(home).origin ? next.pathname : ''}, which is not followed`);
    url = next.href;
    res = await fetch(url, { ...init, redirect: 'manual', signal });
  }
  return res;
}

/** The most of one project file the command reads as text: a manifest, a config, a source file — none comes near it. */
export const READ_LIMIT = 5 * 1024 * 1024;

/**
 * A project file's text, where it is a file and no larger than READ_LIMIT; otherwise it throws, as a missing one does.
 * A cloned repository can hold a link to /dev/zero, or a pipe, under any name the command reads: it waited, or filled
 * its memory, for ever (25 Sep 2026).
 */
export function readText(path, limit = READ_LIMIT) {
  const st = statSync(path);
  if (!st.isFile()) throw new Error(`${path} is not a file`);
  if (st.size > limit) throw new Error(`${path} is larger than any file this reads`);
  return readFileSync(path, 'utf8');
}

/**
 * Why a file's contents have no place in a store zip, whatever it is called, or null: a private key, a cloud service
 * account's key, a source map written into the code. Names alone let `key.txt`, a Google Cloud key under the name
 * its console gives it, and a bundle's inline map through (25 Sep 2026). So did a live secret in a file of any name
 * — a Stripe or AWS key, a GitHub, Slack or npm token, a password in an address — until round 7 of the same day, and
 * an OpenAI or Anthropic key, a Slack app token, a Stripe test key and an AWS secret access key until round 8.
 *
 * All of the file, in each form a copy of a text takes (readThrough): the first 4 MB alone were read, so a key further
 * into a large bundle was packed; and a copy in UTF-16, or in base64, held its secret between NULs or in other letters
 * (round 9, 25 Sep 2026).
 */
export function privateContent(bytes) {
  return readThrough(bytes, (text) => {
    if (/"type"\s*:\s*"service_account"/.test(text) && /"private_key"\s*:/.test(text)) return "a service account's key inside";
    if (pemKey(text)) return 'a private key inside';
    if (/[#@]\s*sourceMappingURL\s*=\s*data:/.test(text)) return 'a source map inside';
    for (const [shape, why, honest] of SECRETS) for (const found of text.matchAll(shape)) if (!standIn(found[1] ?? found[0]) && !honest?.(found)) return why;
    if (passwordIn(text)) return 'a password in an address inside';
    return null;
  });
}

/**
 * A secret by its whole shape, and what to call it — never by its prefix alone, which code that checks for one holds
 * (`key.startsWith('sk_live_')`), nor a publishable key, which is made to be in a browser — and, for some, what says
 * the one found is honest after all. Where a shape captures, the capture is the secret, and the rest what names it.
 */
const SECRETS = [
  [/\b[rs]k_live_[0-9A-Za-z]{24,}/g, 'a Stripe live key inside'],
  // A test key reads and writes the account's test data, customers' addresses among them: a secret too (round 8).
  [/\b[rs]k_test_[0-9A-Za-z]{24,}/g, 'a Stripe test key inside'],
  [/\bwhsec_[A-Za-z0-9+/]{24,}/g, 'a webhook signing secret inside'],
  // Toolaby's own API key, a workspace's secret: `wk_live_` or `wk_test_` and 32 letters, as the dashboard makes them.
  // It reads and changes every buyer of the workspace's; the extension holds the tool key alone (2 Oct 2026).
  [/\bwk_(?:live|test)_[A-Za-z0-9]{20,80}(?![A-Za-z0-9])/g, 'a Toolaby API key inside'],
  // A long-term key's id, or a temporary one's (ASIA…), which comes with its secret and a session token (round 9).
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, 'an AWS access key inside'],
  // Its secret, which a file can hold without the AKIA id beside it: 40 characters of base64 where a name says what
  // they are (aws_secret_access_key, AWS_SECRET_ACCESS_KEY, secretAccessKey…), both cases in them, as no hex digest's.
  [/(?:(?<![A-Za-z0-9])aws[\w.-]{0,30}?|secret_?access_?key)["']?[ \t]{0,16}(?:[:=]|=>)[ \t]{0,16}["']?([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+=])/gi, 'an AWS secret access key inside', ([, key]) => !/[A-Z]/.test(key) || !/[a-z]/.test(key)],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82,})/g, 'a GitHub token inside'],
  [/\bxox[abprs]-\d+-[A-Za-z0-9-]{20,}/g, 'a Slack token inside'],
  [/\bxapp-\d-[A-Z0-9]{8,}-\d{8,}-[A-Za-z0-9]{32,}/g, 'a Slack app token inside'],
  [/\bnpm_[A-Za-z0-9]{36,}/g, 'an npm token inside'],
  // Google's OAuth client secret, which signs in as the app: both cases after GOCSPX-, as no placeholder has (round 9).
  [/\bGOCSPX-[A-Za-z0-9_-]{20,}/g, 'a Google OAuth client secret inside', ([secret]) => !/[A-Z]/.test(secret.slice(7)) || !/[a-z]/.test(secret.slice(7))],
  // OpenAI's: a project's, a service account's or an admin's, or the first kind, 48 characters after sk-.
  [/\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{80,}|[A-Za-z0-9]{48}(?![A-Za-z0-9_-]))/g, 'an OpenAI key inside'],
  [/\bsk-ant-[a-z]{2,8}\d{2}-[A-Za-z0-9_-]{80,}/g, 'an Anthropic key inside'],
  // A PuTTY key file by its first two lines, the key's kind and then its encryption: code that reads one holds neither (round 9).
  [/PuTTY-User-Key-File-\d+: [\w.@-]+(?:\r?\n|(?:\\r)?\\n)Encryption: [\w-]+/g, 'a private key inside'],
  // Supabase's service_role key: a JWT whose payload names the role, which passes every row-level rule. The anon key and
  // a signed-in user's token have the same shape, and are made to be in a browser, as a publishable key is (round 9).
  [/\bey[A-Za-z0-9_-]{10,500}\.ey[A-Za-z0-9_-]{10,4000}\.[A-Za-z0-9_-]{20,1000}/g, 'a Supabase service_role key inside', ([jwt]) => !adminRole(jwt)],
];
/** What stands where a secret goes, in docs and examples: a run of one character, or AWS's own EXAMPLE key. */
const standIn = (found) => /(.)\1{7}/.test(found) || found.includes('EXAMPLE');
/** Whether a JWT's payload names Supabase's service_role, or its supabase_admin. */
function adminRole(jwt) {
  try { return ['service_role', 'supabase_admin'].includes(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).role); } catch { return false; }
}

/** A Google API key: `AIza` and 35 more. */
const GOOGLE_KEY = /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g;
/**
 * Whether a file holds a Google API key, a stand-in aside. Such a key is made to be in a browser — a Firebase web
 * config's, the Maps or YouTube key an extension calls with — and is kept to its use by its restrictions in Google
 * Cloud, not by being unseen. `pack` packs the file and names it (round 9, 25 Sep 2026): it left it out until then,
 * breaking the zip for a lone Firebase key or a YouTube key, and let any key through beside a Firebase word.
 */
export function googleKey(bytes) {
  return readThrough(bytes, (text) => ([...text.matchAll(GOOGLE_KEY)].some(([key]) => !standIn(key)) ? 'a Google API key' : null)) !== null;
}

/** How much of a file is read as text at once, and how far each piece reaches back into the one before: further than any shape read here, a private key's 32 KB among them. */
const PIECE = 4 * 1024 * 1024;
const OVERLAP = 128 * 1024;

/**
 * The first answer `look` gives for a file's text, with the form the file held it in, or null. Each of the file's
 * readings is read in pieces of PIECE bytes, each reaching OVERLAP back into the one before: what a boundary splits is
 * whole in one of them, and no string is larger than a piece, however large the file.
 */
function readThrough(bytes, look) {
  for (const [view, how] of readings(bytes)) {
    for (let from = 0; from < view.length; from += PIECE - OVERLAP) {
      const found = look(view.subarray(from, from + PIECE).toString('latin1'));
      if (found) return `${found}${how}`;
      if (from + PIECE >= view.length) break;
    }
  }
  return null;
}

/**
 * A file's bytes in each form a copy of a text takes, as [bytes, how it held them]: as they are; decoded from UTF-16,
 * as Windows PowerShell 5.1 writes `Get-Content .env > dist\data.txt`; decoded from base64, where the file is that and
 * nothing else; and one inside the other, three deep, since PowerShell's `>` writes base64 in UTF-16 too. Only a file
 * of `limit` bytes at most is decoded (round 9, 25 Sep 2026).
 */
function readings(bytes, limit = Infinity, how = '', depth = 3) {
  const all = [[bytes, how && `, in ${how}`]];
  if (!depth || bytes.length > limit) return all;
  const order = utf16(bytes);
  if (order) all.push(...readings(fromUtf16(bytes, order), limit, how ? `${how} and UTF-16` : 'UTF-16', depth - 1));
  const held = fromBase64(bytes);
  if (held) all.push(...readings(held, limit, how ? `${how} and base64` : 'base64', depth - 1));
  return all;
}

/**
 * Which way round a text in UTF-16 is, 'le' or 'be', or null: by its byte-order mark (FF FE, FE FF), or, with none, by
 * the NULs of its Latin letters, in the same half of three pairs in four over its first 512.
 */
function utf16(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'be';
  const pairs = Math.min(bytes.length >> 1, 512);
  if (pairs < 8) return null;
  let low = 0; let high = 0;
  for (let i = 0; i < pairs * 2; i += 2) {
    if (bytes[i] && !bytes[i + 1]) low++;
    else if (!bytes[i] && bytes[i + 1]) high++;
  }
  return low >= pairs * 0.75 ? 'le' : high >= pairs * 0.75 ? 'be' : null;
}

/** A text in UTF-16 as UTF-8, a piece at a time. */
function fromUtf16(bytes, order) {
  const even = bytes.length - (bytes.length % 2);
  const parts = [];
  for (let from = 0; from < even; from += PIECE) {
    const piece = bytes.subarray(from, Math.min(from + PIECE, even));
    // Big-endian turned round in a copy: swap16 turns the bytes it is given round where they are.
    parts.push(Buffer.from((order === 'be' ? Buffer.from(piece).swap16() : piece).toString('utf16le'), 'utf8'));
  }
  return Buffer.concat(parts);
}

const BASE64 = new Uint8Array(256);
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/-_') BASE64[c.charCodeAt(0)] = 1;
/**
 * What a file that is base64 and nothing else holds, or null: past blank space and a byte-order mark, 16 characters at
 * least, of either alphabet, and `=` only at the end. Decoded a piece at a time: PIECE is a whole number of quartets.
 */
function fromBase64(bytes) {
  let count = 0; let end = 0;
  for (let i = bom(bytes); i < bytes.length; i++) {
    const b = bytes[i];
    if (blank(b)) continue;
    if (b === 0x3d) { if (++end > 2) return null; } else if (end || !BASE64[b]) return null;
    count++;
  }
  if (count < 16 || (count - end) % 4 === 1) return null;
  const parts = [];
  const chars = Buffer.allocUnsafe(Math.min(count, PIECE));
  let n = 0;
  for (let i = bom(bytes); i < bytes.length; i++) {
    if (blank(bytes[i])) continue;
    chars[n++] = bytes[i];
    if (n === chars.length) { parts.push(Buffer.from(chars.toString('latin1'), 'base64')); n = 0; }
  }
  if (n) parts.push(Buffer.from(chars.toString('latin1', 0, n), 'base64'));
  return Buffer.concat(parts);
}

/** An address with a password in it, `scheme://user:password@host`: the user and password as an address spells them. */
const ADDRESS = /\b[a-z][a-z0-9+.-]{1,15}:\/\/([a-z0-9._~%!+,;=-]{1,64}):([a-z0-9._~%!+,;=-]{1,128})@([a-z0-9.-]+|\[[0-9a-f:.]+\])/gi;
/** A password that is the example's word for one, as docs and error messages write it. */
const EXAMPLE_PASSWORD = /^(?:pass(?:word|wd)?|pwd|pw|secret|changeme|x+|\.+|(?:your|my)[-_]?pass(?:word)?)$/i;
/**
 * Whether the text holds a live password in an address: not an example's (`user:password@`, a user's own name as its
 * password, as local databases are set up), and not one for this machine, which reaches nothing elsewhere.
 */
function passwordIn(text) {
  for (const [, user, password, host] of text.matchAll(ADDRESS)) if (password !== user && !EXAMPLE_PASSWORD.test(password) && !LOOPBACK.test(host)) return true;
  return false;
}

const PEM_BEGIN = /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?)-----/g;
/**
 * Whether the text holds a PEM private key: its BEGIN line, lines of base64 after any header lines (Proc-Type,
 * DEK-Info, a PGP block's Version), and its own END line — the line breaks real, or written as \n in JSON or a string.
 * The BEGIN line alone is code's: jose's importPKCS8 checks a string starts with it, and a bundle holding jose was
 * refused as a key until round 7 (25 Sep 2026).
 */
function pemKey(text) {
  for (const begin of text.matchAll(PEM_BEGIN)) {
    const from = begin.index + begin[0].length;
    const to = text.indexOf(`-----END ${begin[1]}-----`, from);
    if (to < 0 || to - from > 32 * 1024) continue;
    const lines = text.slice(from, to).replace(/\\+[nr]|\r/g, '\n').split('\n').map((l) => l.trim().replace(/\\$/, '')).filter((l) => l && !/^[A-Za-z][A-Za-z-]*: /.test(l));
    if (lines.length && lines.every((l) => /^[A-Za-z0-9+/=]+$/.test(l)) && lines.join('').length >= 40) return true;
  }
  return false;
}

/** Whether anything is at the path, a link to nowhere included. */
const there = (path) => { try { lstatSync(path); return true; } catch { return false; } };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The project a built folder belongs to: the nearest folder at or above it with a package.json or a .git — or null,
 * and never the home folder or the top of the disk, which are no project to look through.
 */
export function projectRoot(folder) {
  const home = resolve(homedir());
  for (let at = resolve(folder); at !== home && dirname(at) !== at; at = dirname(at)) {
    if (there(join(at, 'package.json')) || there(join(at, '.git'))) return at;
  }
  return null;
}

/** The most of one file `pack` compares by its bytes, and how far into a project it looks for the private ones. */
const COPY_LIMIT = 4 * 1024 * 1024;
const LOOK = { depth: 4, entries: 20_000 };
/** Folders the look for private files passes by: installed packages, caches, and git's own, of which only config is read. */
const PASSED_BY = new Set(['node_modules', '.git', '.pnpm-store', '.yarn', '.next', '.turbo', '.cache']);

/** Space, tab, and the line ends and feeds: what a text form changes, and what its start passes over. */
const blank = (b) => b === 0x20 || (b >= 0x09 && b <= 0x0d);
const bom = (bytes) => (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0);

/**
 * A text as it reads, whatever an editor, a platform or a build did around its words: no byte-order mark, LF line
 * ends, no space or tab at the end of a line, nothing blank at the end — or null for what is no text (a NUL in its
 * first 8,000 bytes, as git judges one) or nothing but blank. One pass, and no pattern that could backtrack.
 */
function textForm(bytes) {
  if (bytes.subarray(0, 8000).includes(0)) return null;
  const out = Buffer.allocUnsafe(bytes.length);
  let n = 0;
  for (let i = bom(bytes); i < bytes.length; i++) {
    const b = bytes[i];
    if (b !== 0x0a && b !== 0x0d) { out[n++] = b; continue; }
    if (b === 0x0d && bytes[i + 1] === 0x0a) i++;
    while (n && (out[n - 1] === 0x20 || out[n - 1] === 0x09)) n--;
    out[n++] = 0x0a;
  }
  while (n && blank(out[n - 1])) n--;
  return n ? out.subarray(0, n) : null;
}

/**
 * The first 64 bytes of a text that are not blank, after a byte-order mark: every text form of a text starts with the
 * same, so a file that starts otherwise is no copy — told without reading on. Null for a NUL among them, or none.
 */
function textStart(bytes) {
  let start = '';
  for (let i = bom(bytes); i < bytes.length && start.length < 64; i++) {
    if (bytes[i] === 0) return null;
    if (!blank(bytes[i])) start += String.fromCharCode(bytes[i]);
  }
  return start || null;
}

/** The names a build gives a compressed copy: vite-plugin-compression's and compression-webpack-plugin's, beside the file. */
export const COMPRESSED = /\.(gz|br)$/i;

/**
 * What a compressed file holds, and the name it had — `{ name, bytes }` — or null: a gzip whatever its name, and by the
 * name a build gives it a .gz of zlib's (a plugin's "deflate") or a .br. Opened to `limit` bytes and no further, as
 * zlib's maxOutputLength stops it: one that holds more, a bomb among them, is null, as are what is not compressed and
 * what does not open. A build's compression plugin writes data.json.gz and .br beside data.json, and `pack` judged
 * them by their compressed bytes, in which nothing private can be read (round 8, 25 Sep 2026).
 *
 * A .gz that is not zlib's is opened as raw deflate, which has no header to know it by: vite-plugin-compression's
 * deflateRaw writes one under that name, and it was packed (round 9, 25 Sep 2026).
 */
export function unpacked(name, bytes, limit = COPY_LIMIT) {
  const ways = bytes[0] === 0x1f && bytes[1] === 0x8b ? [gunzipSync] : /\.br$/i.test(name) ? [brotliDecompressSync] : /\.gz$/i.test(name) ? [inflateSync, inflateRawSync] : [];
  for (const open of ways) {
    try { return { name: name.replace(COMPRESSED, ''), bytes: open(bytes, { maxOutputLength: limit }) }; } catch { /* the next way, if there is one */ }
  }
  return null;
}

/**
 * What says a file of a build is a copy of a private one: `why(bytes)`, which answers "a copy of .env, an environment
 * file" or null. Its bytes are compared (SHA-256) with every file under `root` that is private by its name (privateKind:
 * .env files, keys, .npmrc, credentials…), with `root`'s .git/config, and with `more` — [path, what it is] — each a
 * few MB at most and not empty. A build resolves a link before `pack` sees it: WXT and Vite copy what a link in public/
 * points at as an ordinary file under the link's name, so a cloned template's public/icon-128.png -> ../.env reached
 * the zip as a PNG, the developer's .env inside (25 Sep 2026).
 *
 * And so is their text: a copy with CRLF line ends, a byte-order mark, or a newline more or less at its end had other
 * bytes, and was packed (round 8, 25 Sep 2026). Each text form is compared too — only a file whose text starts as a
 * private one's is read through, so a build's bundles cost a look at their first 64 characters.
 *
 * And so is what they hold in each form a copy of a text takes (readings): a copy in UTF-16, which Windows PowerShell
 * 5.1 writes for `Get-Content .env > dist\data.txt`, or in base64, had other bytes and no text form, and was packed
 * (round 9, 25 Sep 2026). A private file in UTF-16 is known by its text in UTF-8 as well.
 */
export function privateCopies(root, more = []) {
  const known = new Map(); // size → hash → what the file is
  const texts = new Map(); // how its text starts → hash of its text form → what the file is
  const note = (path, what) => {
    let bytes;
    try { const st = statSync(path); if (!st.isFile() || st.size > COPY_LIMIT) return; bytes = readFileSync(path); } catch { return; }
    for (const [view] of readings(bytes)) {
      // Nothing in it is nothing to keep, and a copy of nothing is every empty file.
      if (!view.toString('latin1').trim()) continue;
      const same = known.get(view.length) ?? new Map();
      known.set(view.length, same);
      const hash = sha256(view);
      if (!same.has(hash)) same.set(hash, what);
      const form = textForm(view);
      const start = form && textStart(view);
      if (!start) continue;
      const alike = texts.get(start) ?? new Map();
      texts.set(start, alike);
      const formHash = sha256(form);
      if (!alike.has(formHash)) alike.set(formHash, what);
    }
  };
  let entries = 0;
  // Level by level, so the project's own top — where .env and .npmrc are kept — is always read, however large the rest.
  for (let level = root ? [root] : [], depth = 0; level.length && depth <= LOOK.depth; depth++) {
    const next = [];
    for (const dir of level) {
      let names;
      try { names = readdirSync(dir).sort(); } catch { continue; }
      for (const name of names) {
        if (++entries > LOOK.entries) break;
        const path = join(dir, name);
        const rel = relative(root, path).split(sep).join('/');
        let st;
        try { st = lstatSync(path); } catch { continue; }
        if (st.isDirectory()) {
          if (name === '.git') note(join(path, 'config'), `${rel}/config`);
          else if (!PASSED_BY.has(name)) next.push(path);
          continue;
        }
        // A private file that is itself a link is read where it points: a build following a link reads it there too.
        const kind = privateKind(name);
        if (kind && kind !== 'a source map') note(path, `${rel}, ${kind}`);
      }
    }
    level = next;
  }
  for (const [path, what] of more) note(path, what);
  return (bytes) => {
    // Decoded up to three times the most a private file is: its copy in UTF-16, or in base64 written in UTF-16, is no larger.
    for (const [view, how] of readings(bytes, 3 * COPY_LIMIT)) {
      let what = known.get(view.length)?.get(sha256(view));
      if (!what && view.length <= COPY_LIMIT) {
        const alike = texts.get(textStart(view));
        const form = alike && textForm(view);
        if (form) what = alike.get(sha256(form));
      }
      if (what) return `a copy of ${what}${how}`;
    }
    return null;
  };
}

/**
 * Whether a folder is a git repository's own — HEAD, config and an objects/ folder — as a build leaves one it copied
 * whole from a link to .git: the remote, with any token in its address, and every commit (25 Sep 2026). A repository
 * with no commit yet has an empty objects/, which a build that copies files leaves behind; its HEAD says what it is.
 */
export function gitDirectory(dir) {
  try {
    if (!lstatSync(join(dir, 'HEAD')).isFile() || !lstatSync(join(dir, 'config')).isFile()) return false;
    if (there(join(dir, 'objects')) && lstatSync(join(dir, 'objects')).isDirectory()) return true;
    return /^(ref: refs\/|[0-9a-f]{40}\s|[0-9a-f]{64}\s)/.test(readText(join(dir, 'HEAD'), 4096));
  } catch { return false; }
}

/**
 * Git's own history, whatever its name: a pack or its index (`PACK`, `\xfftOc`), or a loose object — zlib that opens
 * on `blob 57\0`, `tree`, `commit`, `tag`. A build that follows a link to .git/objects copies a folder of these, every
 * commit in it, files removed from the tree among them; round seven looked for a repository's HEAD and config, which
 * an object store has not (round 8, 25 Sep 2026).
 */
export function gitObject(bytes) {
  if (bytes.length >= 8 && (bytes.subarray(0, 4).toString('latin1') === 'PACK' || bytes.subarray(0, 4).equals(Buffer.from([0xff, 0x74, 0x4f, 0x63])))) return 'git history';
  if (bytes.length >= 2 && bytes[0] === 0x78 && (bytes[0] * 256 + bytes[1]) % 31 === 0) {
    try {
      const head = inflateSync(bytes.subarray(0, 1024), { finishFlush: zlibConstants.Z_SYNC_FLUSH }).subarray(0, 32).toString('latin1');
      if (/^(blob|tree|commit|tag) \d+\0/.test(head)) return 'git history';
    } catch { /* not zlib, or not whole: nothing git reads */ }
  }
  return null;
}

/** A line of git's list of refs (packed-refs, which starts with its own header, or FETCH_HEAD), and one of its logs. */
const GIT_REFS = /^(?:# pack-refs with:|[0-9a-f]{40}(?:[0-9a-f]{24})?\t(?:not-for-merge)?\t)/;
const GIT_LOG = /^[0-9a-f]{40}(?:[0-9a-f]{24})? [0-9a-f]{40}(?:[0-9a-f]{24})? [^\n<]*<[^\n>]*> \d+ [+-]\d{4}(?:\t|\r?\n|$)/;
/**
 * Git's other files, whatever their names, by what they hold: its index (`DIRC`), its list of refs, the log of where
 * each branch has been — an author, a time and a commit's subject a line — and a repository's config, which names its
 * remote. A build that copied them from .git under other names shipped them all, the objects aside (round 9, 25 Sep
 * 2026). A commit message being written (COMMIT_EDITMSG) is text like any other, and is not told apart.
 */
export function gitFile(bytes) {
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'DIRC' && [2, 3, 4].includes(bytes.readUInt32BE(4))) return "git's index";
  const head = bytes.subarray(0, 64 * 1024).toString('latin1');
  if (GIT_REFS.test(head)) return "git's refs";
  if (GIT_LOG.test(head)) return "git's log";
  // A config from its first section on (comments before it aside), with the [core] and the format version git writes.
  if (/^\s*(?:[#;][^\n]*\n\s*)*\[[^\]\n]+\]/.test(head) && /^[ \t]*\[core\][ \t]*\r?$/m.test(head) && /^[ \t]*repositoryformatversion[ \t]*=/m.test(head)) return "git's config";
  return null;
}

/** Whether a folder is a copy of git's object store — its pack/ or a two-hex folder holding an object — to leave out whole, one line said. */
export function gitObjects(dir) {
  try {
    for (const name of readdirSync(dir).slice(0, 300)) {
      const p = join(dir, name);
      if (!lstatSync(p).isDirectory() || !(name === 'pack' || /^[0-9a-f]{2}$/.test(name))) continue;
      const first = readdirSync(p).find((f) => lstatSync(join(p, f)).isFile());
      if (first && gitObject(readFileSync(join(p, first)).subarray(0, 4096))) return true;
    }
  } catch { /* unread: its files are judged one by one */ }
  return false;
}

// .avif, .tif and .tiff, and .apng and .jfif (a PNG's and a JPEG's bytes), were no picture's names until round 8.
const RASTER = /\.(a?png|jpe?g|jfif|gif|webp|avif|ico|bmp|tiff?)$/i;
/**
 * The first bytes of each kind of picture an extension shows: PNG, JPEG, GIF, WebP, ICO, BMP (whose reserved bytes
 * are zero, as no text's are), AVIF's box, and TIFF's byte order and 42 (43 for BigTIFF). Any of them passes under any
 * picture's name: Chrome reads a picture by its bytes, and a JPEG saved as .png is no secret.
 */
const PICTURE = [
  (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  (b) => /^GIF8[79]a/.test(b.subarray(0, 6).toString('latin1')),
  (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  (b) => b.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00])),
  (b) => b.length >= 10 && b.subarray(0, 2).toString('latin1') === 'BM' && b.readUInt32LE(6) === 0,
  (b) => b.subarray(4, 8).toString('latin1') === 'ftyp',
  (b) => ['49492a00', '4d4d002a', '49492b00', '4d4d002b'].includes(b.subarray(0, 4).toString('hex')),
];
/**
 * Why a file named as an image is none, or null: its first bytes are no picture's, or — an .svg — it is not SVG's
 * text. A build that followed a link left a .env or a git config under an icon's name, and nothing else looked
 * inside it (25 Sep 2026). An empty file holds nothing, and passes.
 */
export function notAnImage(name, bytes) {
  if (!bytes.length) return null;
  if (/\.svg$/i.test(name)) {
    const text = bytes.subarray(0, 1024 * 1024).toString('utf8').replace(/^\ufeff/, '');
    return /^\s*</.test(text) && /<svg[\s>/:]/i.test(text) ? null : 'not the image its name says';
  }
  return RASTER.test(name) && !PICTURE.some((is) => is(bytes)) ? 'not the image its name says' : null;
}

/** The folders a build copies as they are: public/ (Vite, CRXJS and WXT), WXT's under src/, and one a config names. */
const PUBLIC_DIRS = ['public', 'src/public'];
const BUILD_CONFIGS = ['wxt.config', 'vite.config'].flatMap((n) => ['ts', 'mts', 'js', 'mjs'].map((e) => `${n}.${e}`));

/**
 * The symbolic links in the folders of `root` that a build copies as they are, relative to it — but for those inside
 * `packed`, whose links `pack` leaves out and names. WXT's copyPublicDirectory and Vite's copyDir copy what a link
 * points at, so a template's public/icon-128.png -> ../.env is a PNG in the build; `pack` sees only the build, where
 * the link is gone, and says where they are (25 Sep 2026).
 */
export function publicLinks(root, packed = null) {
  return [...new Set(publicLinkEntries(root, packed).map((e) => e.link))].sort();
}

/**
 * The links of the folders a build copies as they are whose target a store zip must never hold — inside a .git
 * folder, or private by its name — and where the build put each: its path under the folder it is in, which the build
 * copies to the top of its output. `pack` leaves those out of the build, and says why (round 8, 25 Sep 2026): a warning
 * let `public/vendor -> ../.git/objects` ship every commit. A link to anything else is said, as before, not refused:
 * a monorepo's shared icons are links too.
 *
 * `.git` in any case: macOS and Windows find `../.GIT/logs` all the same, and it was packed (round 9, 25 Sep 2026).
 */
export function privateLinks(root, packed = null) {
  const out = [];
  for (const { link, within, path } of publicLinkEntries(root, packed)) {
    let target;
    try { target = realpathSync(path); } catch { continue; }
    const kind = privateKind(target.split(sep).pop() ?? '');
    const why = target.split(sep).some((part) => part.toLowerCase() === '.git') ? 'a link into .git' : kind ? `a link to ${kind}` : null;
    if (why) out.push({ link, within, why });
  }
  return out;
}

function publicLinkEntries(root, packed = null) {
  const dirs = new Set(PUBLIC_DIRS);
  for (const config of BUILD_CONFIGS) {
    let text;
    try { text = readText(join(root, config)); } catch { continue; }
    const named = /\bpublicDir\s*:\s*(['"`])([^'"`\n]+)\1/.exec(text)?.[2];
    if (named) dirs.add(posix.normalize(named).replace(/\/+$/, ''));
  }
  const links = [];
  let entries = 0;
  const walk = (base, dir, depth) => {
    let names;
    try { names = readdirSync(dir).sort(); } catch { return; }
    for (const name of names) {
      if (++entries > 5_000) return;
      const path = join(dir, name);
      let st;
      try { st = lstatSync(path); } catch { continue; }
      if (st.isSymbolicLink()) links.push({ path, base });
      else if (st.isDirectory() && depth < 8) walk(base, path, depth + 1);
    }
  };
  for (const dir of dirs) {
    const at = resolve(root, dir);
    // Not one a config names outside the project, which is not this command's to look through, nor one in the folder packed.
    if (!at.startsWith(resolve(root) + sep) || (packed && (at === packed || at.startsWith(packed + sep)))) continue;
    let st;
    try { st = lstatSync(at); } catch { continue; }
    // The folder itself a link: the build copies it whole, to the top of its output.
    if (st.isSymbolicLink()) links.push({ path: at, base: at });
    else if (st.isDirectory()) walk(at, at, 0);
  }
  const posixOf = (p) => p.split(sep).join('/');
  return links.map(({ path, base }) => ({ path, link: posixOf(relative(root, path)), within: path === base ? '' : posixOf(relative(base, path)) }));
}

/**
 * The page `login` opens: the one Toolaby gave, when it is Toolaby's own over https — or, for a Toolaby server on this
 * machine, a page on this machine. Anything else is null, and is not opened: an address elsewhere, a downgrade to
 * http, or a scheme such as file: that opens whatever it names. A Toolaby server under a path gives a page under it: Test at
 * toolaby.app/test approves its codes at toolaby.app/test/…, and Live's page of the same name knows none of them (a
 * root path resolved against Test's own base loses /test: 29 Sep 2026).
 */
export function signInPage(link, wall) {
  if (typeof link !== 'string') return null;
  let home; let page;
  try { home = new URL(wall); page = new URL(link, home); } catch { return null; }
  if (page.username || page.password) return null;
  const base = home.pathname.replace(/\/+$/, '');
  // Under Toolaby's own path; and for a Toolaby server with none, nothing of Test's under /test (withinWall).
  if (base ? !under(page.pathname, base) : under(page.pathname, TEST_PATH)) return null;
  if (page.protocol === 'https:' && page.origin === home.origin) return page.href;
  const web = page.protocol === 'http:' || page.protocol === 'https:';
  return web && LOOPBACK.test(home.hostname) && LOOPBACK.test(page.hostname) ? page.href : null;
}

/**
 * How long `login` waits between asking whether its code was approved, and how long it asks at all, in milliseconds:
 * what Toolaby said (where it said nothing, RFC 8628's 5 seconds, and ten minutes), within one second and half a
 * minute between asks, and a quarter of an hour in all. It took Toolaby's word, so a Toolaby server at another address (--server,
 * TOOLABY_SERVER) kept it waiting as long as it said (round 9, 25 Sep 2026).
 */
export function devicePolling({ interval, expires_in: expiresIn } = {}) {
  const seconds = (value, otherwise, least, most) => Math.min(Math.max(Number(value) > 0 && Number.isFinite(Number(value)) ? Number(value) : otherwise, least), most);
  return { every: seconds(interval, 5, 1, 30) * 1000, lasts: seconds(expiresIn, 600, 1, 15 * 60) * 1000 };
}

/**
 * How a page is opened on each platform, the address one argument and no shell in between. On Windows,
 * `cmd /c start "" <url>` read an `&` in the address as a second command; rundll32 hands it to the default browser
 * as it is.
 */
export function opener(platform, url) {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}

/**
 * Why a file has no place in a store zip, or null: a private key or a keystore (Chrome's own "Pack extension" leaves
 * the extension's .pem beside the folder, and it ends up inside), a certificate, an environment file, a file of
 * credentials by its name — a cloud service account's key, a package registry's or a machine's login — or a source
 * map, which carries the source. A store zip is public: anyone can download an item and unzip it. `pack` leaves these
 * out and names them; --allow-private packs them. Dotfiles, .env and .npmrc among them, are never packed, and are
 * named here all the same. A certificate, a service account's key under the name its console downloads it with
 * (firebase-adminsdk-…json, …-service-account-…json), an SSH key with a suffix and Windows' _netrc were packed until
 * 25 Sep 2026.
 */
export function privateKind(name) {
  const n = name.toLowerCase();
  if (/\.(pem|key|p12|pfx|p8|jks|keystore|bks|ppk)$/.test(n) || /^id_(rsa|dsa|ecdsa|ed25519)(?!.*\.pub$)/.test(n)) return 'a private key';
  if (/\.(crt|cer|der)$/.test(n)) return 'a certificate';
  if (/\.env(\.[^.]+)*$/.test(n)) return 'an environment file';
  if (/^(credentials|secrets?)(\.(json|ya?ml|toml))?$/.test(n) || /(service[-_]?account|firebase-adminsdk|^client_secret)[^/]*\.json$/.test(n)) return 'credentials';
  if (/\.tfstate(\.backup)?$/.test(n)) return "a deployment's state";
  if (/^[._]?(npmrc|yarnrc\.yml|netrc|pypirc|git-credentials|htpasswd|pgpass)$/.test(n)) return 'credentials';
  if (n.endsWith('.map')) return 'a source map';
  return null;
}
