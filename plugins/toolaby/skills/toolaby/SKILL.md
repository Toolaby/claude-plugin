---
name: toolaby
description: "Routes Toolaby work in a Chrome extension that sells: pro, premium, paywall, pricing, price, plan, licence, license, checkout, purchase, unlock, upgrade, trial, subscription, team, seats, coupon, webhook, ExtensionPay, sign-in, Chrome Web Store. Toolaby runs accounts, licences, subscriptions, trials, seats and the paywall for Manifest V3 extensions, on the developer's own Stripe account, with an MCP server and the `npx -y toolaby@latest` command line. Use when the user mentions Toolaby, toolaby.js, TOOLABY.md or gate(), or wants to charge for an extension: it says which toolaby-* skill fits, how to set the agent up, and how to verify."
---

# Toolaby

Toolaby runs accounts, licences, subscriptions, trials, seats and the paywall for Chrome extensions (Manifest V3) that sell, on the developer's own Stripe account. An extension is wired to a **tool**, and its code asks `gate()` before paid work. Everything acts on Test unless told `--live`.

## Start

1. Read `TOOLABY.md` at the project's root. No `TOOLABY.md`: `npx -y toolaby@latest tools` lists the tool ids; `npx -y toolaby@latest wire <tool>` wires an existing extension, `npx -y toolaby@latest create <tool>` makes a new one, and `npx -y toolaby@latest tool create --name "…"` makes the tool first.
2. Once per machine: `npx -y toolaby@latest agents` registers Toolaby's MCP server in each coding agent it finds. No `toolaby_*` MCP tools here? Every one has a command: `npx -y toolaby@latest <command> --json` prints the raw answer. `npx -y toolaby@latest agents` registers the MCP server once.
3. Not signed in: `npx -y toolaby@latest login --no-wait --json` answers `{ url, code, deviceCode }`. Give the person the `url` and the `code`, then run `npx -y toolaby@latest login --poll <deviceCode>`, which ends once they approve. In MCP, `toolaby_sign_in` does both.
4. Before writing Toolaby code, look it up: `toolaby_search_docs` (`npx -y toolaby@latest docs search <query>`). Every page is Markdown at https://toolaby.app/docs/<page>.md, listed at https://toolaby.app/llms.txt.

## Which skill

| Task | Skill |
| --- | --- |
| Make something Pro or premium, a paywall, a free or daily allowance | toolaby-sell-a-feature |
| Prices, plans, trials, subscriptions, seats, coupons, what is free | toolaby-pricing |
| Prove a purchase unlocks; test checkout | toolaby-test-a-purchase |
| Release: Live key, store zip, Chrome Web Store | toolaby-ship |
| ExtensionPay or ExtPay in the code | toolaby-extensionpay-move |
| Where `gate()` goes: background, popup, side panel, content script; a `check` code | toolaby-extension-patterns |

Customers and support: `customer <tool> <email>` (entitled, plan, subscription and renewal), `grant`, `refund`, `cancel`, each a command and an MCP tool. A server of the developer's: webhooks (https://toolaby.app/docs/reference/webhooks.md) and the API (https://toolaby.app/docs/reference/api.md), with a key from `npx -y toolaby@latest api-keys create --env-file .env`.

## Safety

- On Live, a change first answers a summary and a `confirm` code. Show the summary; send the code only on the person's word.
- No secret in the extension or in the chat. The tool key (`tk_…`) is public; `wk_…`, `sk_…` and `whsec_…` are not.
- Never edit the `toolaby*` files: `upgrade` replaces them.

## Verify

`npx -y toolaby@latest check --json` exits `0` with `ok: true`; for each `error` finding, run its `fix`, or change what its `message` says. Then tell the person what changed and the steps left for them: approving a sign-in, connecting Stripe on Live, uploading to the Chrome Web Store, a real purchase. Never report those as done.
