// `toolaby mcp`: Toolaby for coding agents, as a Model Context Protocol server on stdio.
//
// An agent (Claude Code, Codex, Cursor, VS Code, Gemini, any MCP client) starts it — `npx -y toolaby@latest agents` sets
// that up — and gets the operations in lib/ops.js as tools: read and change the developer's tools on Toolaby, their
// plans, features, customers, the docs, and check an extension's wiring. It acts with the session `toolaby login` stored
// (or the one toolaby_sign_in gets), on Test unless started with --live, through the same routes and checks as the
// dashboard. Docs pages and tools are resources too; four prompts start the common jobs.
//
// The protocol is the part of MCP a tools server needs, written here: newline-delimited JSON-RPC 2.0 on stdin and
// stdout. The official SDK brings seventeen packages to a command line that has none and that Toolaby also serves as
// one tarball. Nothing but protocol messages goes to stdout.

import { randomBytes, createHash } from 'node:crypto';
import { opsFor, TOOL_ID } from './ops.js';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
/** How long a Live write's confirm code lasts. */
const CONFIRM_MS = 5 * 60_000;

/** The prompts: the jobs an agent is most often asked for, each a first message that says how to do it with these tools. */
function promptsFor(side) {
  const lf = side === 'Live' ? ' --live' : '';
  return [
    {
      name: 'sell-a-feature', title: 'Sell a feature', description: 'Make one feature of this extension paid: a plan, the feature, the gate in the code, and proof it unlocks.',
      arguments: [{ name: 'feature', description: 'What becomes paid, like "export to CSV".', required: true }, { name: 'price', description: 'Like "$5 once" or "$4/month, 7-day trial".', required: false }],
      text: (a) => `Make "${a.feature}" a paid feature of this Chrome extension with Toolaby${a.price ? `, priced ${a.price}` : ''}.\n\n1. toolaby_search_docs "gating" and read TOOLABY.md if the project has it.\n2. Find or make the tool (toolaby_list_tools / toolaby_create_tool); if the folder is not wired, run \`npx -y toolaby@latest wire <id>${lf}\`.\n3. toolaby_add_plan for the price, then toolaby_set_features with a short key for the feature and the plan that unlocks it. If an answer says keyChanged, run \`npx -y toolaby@latest upgrade <id>${lf}\`.\n4. In the code that does the feature: const permit = await toolaby.gate({ feature: '<key>' }); if (!permit.allowed) return toolaby.showPaywall(permit); — in a page script loaded with type="module".\n5. toolaby_check on the folder until it has no error; then toolaby_test_unlock and toolaby_check with browser and as: <plan id> to prove it unlocks.\n6. Say what is done, and what only a person can do (a real purchase, the store upload).`,
    },
    {
      name: 'move-from-extensionpay', title: 'Move from ExtensionPay', description: 'Switch an ExtensionPay extension to Toolaby, keep its paying users, and list what a person does in Stripe.',
      arguments: [],
      text: () => `Move this extension from ExtensionPay to Toolaby without breaking its paying users.\n\n1. toolaby_docs "extensionpay" and "move-subscriptions".\n2. Make the tool (toolaby_create_tool). Ask the person which paywall people meet first: Toolaby's sign-in and plans (recommended) or ExtensionPay's page, as it was. Then \`npx -y toolaby@latest wire <id> --from-extensionpay --toolaby-popup${lf}\`, or \`--own-popup\`: its ExtPay calls keep working, answered by Toolaby, and its plans are copied.\n3. toolaby_get_tool: check the plans match ExtensionPay's (names, prices, intervals); add any missing with toolaby_add_plan.\n4. toolaby_check until no error, then toolaby_test_unlock + toolaby_check with browser and as.\n5. List the person's steps, which no tool does: copy customers in the Stripe Dashboard, make a restricted key, Import → Move subscriptions on the tool's page, import one-time buyers from a CSV, then toolaby_copy_to_live and a store release.`,
    },
    {
      name: 'ship-to-store', title: 'Ship to the Chrome Web Store', description: 'Copy the tool to Live, put the Live key in, build, pack, and list the person\'s steps.',
      arguments: [{ name: 'version', description: 'The version to ship, like "1.3.0".', required: false }],
      text: (a) => `Prepare this extension for the Chrome Web Store${a.version ? ` as version ${a.version}` : ''}.\n\n1. toolaby_stripe_status on Live: the person connects Stripe there first, or the plans are not copied.\n2. toolaby_copy_to_live for the tool (needs \`npx -y toolaby@latest login --live\` once, by the person).\n3. \`npx -y toolaby@latest upgrade <id> --live\` writes the Live key.\n4. Raise the version, build, then \`npx -y toolaby@latest check --json\` on the build folder: no TEST_KEY_IN_LIVE_BUILD.\n5. \`npx -y toolaby@latest pack <folder>\` makes the zip and refuses secrets and Test keys.\n6. The person uploads the zip, then toolaby_update_tool storeUrl with the listing's address (--live). Say plainly that the upload and the review are theirs.\n7. toolaby_get_tool on Live: sale says On sale, or what still stops a sale.`,
    },
    {
      name: 'fix-wiring', title: 'Fix the Toolaby wiring', description: 'Find and fix why the paywall does not show, or sign-in does not stick.',
      arguments: [{ name: 'symptom', description: 'What users see.', required: false }],
      text: (a) => `${a.symptom ? `Users say: ${a.symptom}. ` : ''}Find and fix this extension's Toolaby wiring.\n\n1. toolaby_check on the folder (and on the build folder if it is built), then with browser: each finding has a code, a fix and a docs link.\n2. Fix each error the way its fix says; never edit the files Toolaby writes (toolaby*.js, toolaby-popup.*) by hand — \`npx -y toolaby@latest upgrade <id>${lf}\` rewrites them.\n3. toolaby_get_tool: compare toolKey with toolaby.config.js, and the features the code gates with the tool's.\n4. toolaby_check again until no error, with browser.`,
    },
  ];
}

/** The server's word for an operation's answer: Toolaby's JSON as text and as structured content, or a text page. */
function resultOf(op, res) {
  const body = res.json ?? {};
  if (!res.ok) {
    const why = body.message ?? body.error ?? `Toolaby answered HTTP ${res.status}.`;
    return { content: [{ type: 'text', text: why }], isError: true };
  }
  if (typeof res.text === 'string') return { content: [{ type: 'text', text: res.text }] };
  return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }], ...(op.output && body && typeof body === 'object' && !Array.isArray(body) ? { structuredContent: body } : {}) };
}

/** JSON with every object's keys in order, at every depth: the same arguments always read the same. */
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
/** A digest of a call's arguments, so a confirm code confirms exactly what was summarised, nested lists included. */
const digest = (name, args) => createHash('sha256').update(`${name}\n${canonical(args)}`).digest('hex');

/**
 * Runs the server until stdin closes. `ctx` carries what the operations need: `api(path, { method, body })` answering
 * `{ ok, status, json }` with the stored session, `token()` saying whether there is one, and the local operations'
 * helpers (docs, searchDocs, check, signIn, testUnlock, copyToLive, apiKey) — see bin.mjs kitContext().
 */
export function runMcp({ version, side, wall, ctx, token, newer = async () => null }) {
  const live = side === 'Live';
  const lf = live ? ' --live' : '';
  // Test-only operations are not offered on Live at all.
  const ops = opsFor(side).filter((o) => !(live && o.testOnly));
  const prompts = promptsFor(side);
  const pending = new Map(); // confirm code → { name, digest, until }
  const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
  const log = (s) => process.stderr.write(`[toolaby mcp] ${s}\n`);
  // A newer toolaby, once known (lib/update.js): in the instructions an agent reads at the start, and in the client's log.
  // The plugin runs the version it names, so the developer updates the plugin to move on.
  let newerVersion = null;
  newer(1500).then((v) => { if (v) { newerVersion = v; log(`toolaby ${v} is out; this server is ${version}`); } }).catch(() => {});
  const needsConfirm = (op) => live && op.kind === 'write' && !op.noConfirm;

  // An input marked `person` is the person's word alone (lib/ops.js): their command line takes it, an agent is never
  // offered it, and one sent anyway is dropped. Offered, an agent passed `now` on its first call and opened a Free plan
  // the platform would have refused to open under installed copies (2 Oct 2026).
  const agentInputs = (op) => Object.fromEntries(Object.entries(op.input.properties ?? {}).filter(([, schema]) => !schema.person));
  const toolList = () => ops.map((op) => ({
    name: op.name,
    title: op.title,
    description: needsConfirm(op) ? `${op.description} On Live this asks first: the first call answers a summary and a confirm code; call again with the same arguments and confirm to do it.` : op.description,
    inputSchema: { type: 'object', properties: { ...agentInputs(op), ...(needsConfirm(op) ? { confirm: { type: 'string', description: 'On Live: the code the first call answered, to confirm.' } } : {}) }, ...(op.input.required?.length ? { required: op.input.required } : {}), additionalProperties: false },
    ...(op.output && !op.text ? { outputSchema: op.output } : {}),
    annotations: { title: op.title, ...op.annotations },
    ...(needsConfirm(op) ? { _meta: { 'anthropic/requiresUserInteraction': true } } : {}),
  }));

  const call = async (name, args) => {
    const op = ops.find((x) => x.name === name);
    if (!op) return { error: { code: -32602, message: `Unknown tool: ${name}` } };
    // Arguments are an object, or none: anything else threw before the answer, and the request went unanswered.
    if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) return { error: { code: -32602, message: 'Arguments are an object.' } };
    const a = { ...(args ?? {}) };
    for (const [k, schema] of Object.entries(op.input.properties ?? {})) if (schema.person) delete a[k];
    if ('tool' in a && (typeof a.tool !== 'string' || !TOOL_ID.test(a.tool))) return { result: { content: [{ type: 'text', text: 'A tool id is lowercase letters, digits and dashes, as toolaby_list_tools gives it.' }], isError: true } };
    const missing = (op.input.required ?? []).filter((r) => a[r] === undefined || a[r] === null || a[r] === '');
    if (missing.length) return { result: { content: [{ type: 'text', text: `Missing: ${missing.join(', ')}.` }], isError: true } };
    if (!op.noSession && !token()) {
      return { result: { content: [{ type: 'text', text: `Not signed in to Toolaby (${side}, ${wall}). Call toolaby_sign_in and show the person its link and code, or run \`npx -y toolaby@latest login${lf}\` in a terminal; then call this again.` }], isError: true } };
    }
    if (needsConfirm(op)) {
      const { confirm, ...rest } = a;
      const d = digest(name, rest);
      if (typeof confirm !== 'string' || !pending.has(confirm)) {
        const code = randomBytes(3).toString('hex');
        pending.set(code, { name, digest: d, until: Date.now() + CONFIRM_MS });
        for (const [c, p] of pending) if (p.until < Date.now()) pending.delete(c);
        const summary = `${op.title} on Live (${wall}) with ${JSON.stringify(rest)}.${op.destructive ? ' This takes something away and cannot be undone here.' : ' This changes what real buyers see or pay.'}`;
        return { result: { content: [{ type: 'text', text: `${summary}\nAsk the person to confirm, then call ${name} again with the same arguments and confirm: "${code}" (valid 5 minutes).` }], structuredContent: { needsConfirmation: true, summary, confirm: code } } };
      }
      const p = pending.get(confirm);
      pending.delete(confirm);
      if (p.name !== name || p.digest !== d || p.until < Date.now()) return { result: { content: [{ type: 'text', text: 'That confirm code is for other arguments, or expired. Call again without confirm for a new one.' }], isError: true } };
      delete a.confirm;
    }
    try {
      return { result: resultOf(op, await op.run(a, ctx)) };
    } catch (e) {
      return { result: { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true } };
    }
  };

  // ── Resources: a docs page by name, and a tool by id ───────────────────────────────────────────────────────────────
  const templates = [
    { uriTemplate: 'toolaby://docs/{page}', name: 'docs-page', title: 'A Toolaby docs page', description: 'A page of the docs as Markdown, like toolaby://docs/gating or toolaby://docs/reference/client.', mimeType: 'text/markdown' },
    { uriTemplate: 'toolaby://tools/{tool}', name: 'tool', title: 'A tool on Toolaby', description: `One of your tools on ${side}, as toolaby_get_tool answers it.`, mimeType: 'application/json' },
  ];
  const readResource = async (uri) => {
    const m = /^toolaby:\/\/(docs|tools)\/(.+)$/.exec(String(uri ?? ''));
    if (!m) return null;
    if (m[1] === 'docs') {
      const res = await ctx.docs(m[2] === 'index' ? '' : m[2]);
      return res.ok ? [{ uri, mimeType: 'text/markdown', text: res.text }] : null;
    }
    if (!TOOL_ID.test(m[2]) || !token()) return null;
    const res = await ctx.api(`/api/cli/tools/${encodeURIComponent(m[2])}`);
    return res.ok ? [{ uri, mimeType: 'application/json', text: JSON.stringify(res.json, null, 2) }] : null;
  };
  const listResources = async () => {
    const out = [{ uri: 'toolaby://docs/index', name: 'docs-index', title: 'Toolaby docs: every page', mimeType: 'text/markdown' }, { uri: 'toolaby://docs/agents', name: 'docs-agents', title: 'Build with an agent', mimeType: 'text/markdown' }];
    if (token()) {
      const res = await ctx.api('/api/cli/tools').catch(() => null);
      for (const t of res?.ok ? res.json.tools ?? [] : []) out.push({ uri: `toolaby://tools/${t.slug}`, name: `tool-${t.slug}`, title: `${t.name} (${side})`, mimeType: 'application/json' });
    }
    return out;
  };

  const handle = async (msg) => {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      if (msg && 'id' in msg && !('method' in msg)) return; // a response to nothing we asked: ignored
      return send({ id: msg?.id ?? null, error: { code: -32600, message: 'Invalid request' } });
    }
    const isRequest = 'id' in msg;
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        return send({ id: msg.id, result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
          serverInfo: { name: 'toolaby', title: 'Toolaby', version },
          instructions: `Toolaby (${side}): paid plans, licences, subscriptions and the paywall for Chrome extensions, on the developer's own Stripe. Search the docs first (toolaby_search_docs). Read a tool (toolaby_get_tool) before changing it; add plans, then features. Gate paid code with toolaby.gate({ feature }). Verify with toolaby_check, then toolaby_test_unlock + toolaby_check { browser, as }. Not signed in: toolaby_sign_in.\n\nThe project you are working in is usually the extension: when it has no toolaby.config.js, wire it yourself with the shell (npx -y toolaby@latest wire <id>${lf}; upgrade <id> after a key change) — it is not a step for the person — then gate its work in code as TOOLABY.md says. Every tool here has the same command (npx -y toolaby@latest <words> --json). ${live ? 'On Live every change asks first: a summary and a confirm code. ' : 'This is Test: nothing here charges anyone. '}Never report a step a person must do (approve sign-in, connect Stripe on Live, upload to the store, a real purchase) as done.${newerVersion ? ` This Toolaby server is ${version} and ${newerVersion} is out: suggest the developer updates the Toolaby plugin, or runs npx -y toolaby@latest.` : ''}`,
        } });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;
      case 'ping':
        return isRequest ? send({ id: msg.id, result: {} }) : undefined;
      case 'tools/list':
        return send({ id: msg.id, result: { tools: toolList() } });
      case 'tools/call': {
        const out = await call(msg.params?.name, msg.params?.arguments);
        return send({ id: msg.id, ...out });
      }
      case 'resources/list':
        return send({ id: msg.id, result: { resources: await listResources() } });
      case 'resources/templates/list':
        return send({ id: msg.id, result: { resourceTemplates: templates } });
      case 'resources/read': {
        const contents = await readResource(msg.params?.uri).catch(() => null);
        return send({ id: msg.id, ...(contents ? { result: { contents } } : { error: { code: -32002, message: `Resource not found: ${String(msg.params?.uri ?? '')}` } }) });
      }
      case 'prompts/list':
        return send({ id: msg.id, result: { prompts: prompts.map(({ text: _t, ...p }) => p) } });
      case 'prompts/get': {
        const p = prompts.find((x) => x.name === msg.params?.name);
        if (!p) return send({ id: msg.id, error: { code: -32602, message: `Unknown prompt: ${String(msg.params?.name ?? '')}` } });
        const given = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {};
        const missing = p.arguments.filter((x) => x.required && !given[x.name]);
        if (missing.length) return send({ id: msg.id, error: { code: -32602, message: `Missing argument: ${missing.map((x) => x.name).join(', ')}` } });
        const clean = Object.fromEntries(Object.entries(given).map(([k, v]) => [k, String(v).replace(/[\u0000-\u001f]/g, ' ').slice(0, 200)]));
        return send({ id: msg.id, result: { description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text(clean) } }] } });
      }
      default:
        return isRequest ? send({ id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } }) : undefined;
    }
  };

  log(`${side} · ${wall} · ${token() ? 'signed in' : 'not signed in: toolaby_sign_in, or `npx -y toolaby@latest login' + lf + '`'}`);
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      // A batch (the 2025-03-26 revision allowed them): each message on its own.
      for (const m of Array.isArray(msg) ? msg : [msg]) handle(m).catch((e) => log(e instanceof Error ? e.stack ?? e.message : String(e)));
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
