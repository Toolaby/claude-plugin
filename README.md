# Toolaby for Claude Code

Sell a Chrome extension from one prompt. [Toolaby](https://toolaby.app) runs paid plans, licences, subscriptions, trials, team seats and the paywall for Manifest V3 extensions, on your own Stripe account. This plugin gives Claude Code Toolaby's MCP server, its skills and five commands, so your agent can:

- create the tool, its plans and prices, and the features each plan unlocks;
- wire your extension (plain, WXT, CRXJS, Plasmo, or one that sold with ExtensionPay) and put `gate({ feature })` in the code that does the paid work;
- check its own work, with findings that each carry a code, a fix and a docs link;
- prove on Test that the paid feature unlocks, in a real browser, with no card and no person;
- read customers, give access, make a coupon for the store reviewer, refund, cancel, and copy the tool to Live.

## Install

In Claude Code:

```
/plugin marketplace add toolaby/claude-plugin
/plugin install toolaby@toolaby
```

Then sign in once: ask Claude to sign in to Toolaby (it calls `toolaby_sign_in` and gives you a link and a code), or run `npx -y toolaby@latest login` in a terminal. Node.js 20 or later.

The plugin carries the MCP server itself: in Claude Code you do not also need `npx -y toolaby@latest agents` (which adds the same server to Codex, Cursor, VS Code and Gemini CLI). Setup for every client: https://toolaby.app/docs/agents.

## Commands

| Command | What it does |
| --- | --- |
| `/toolaby:sell <feature> [price]` | Makes a feature paid, and proves it unlocks |
| `/toolaby:check` | Checks the wiring and fixes what it finds |
| `/toolaby:test-unlock [plan]` | Proves on Test that a plan unlocks its features |
| `/toolaby:ship [version]` | Live key, build, zip for the Chrome Web Store |
| `/toolaby:move-from-extensionpay` | Moves an ExtensionPay extension, keeping its paying users |

## Test and Live

Everything acts on Test (`toolaby.app/test`) unless told `--live`: nothing there charges anyone. On Live, every change the MCP server makes asks first, with a code bound to that exact change. API keys are written into your `.env`, never shown in the chat. What only you can do — approve the sign-in, connect Stripe on Live, upload to the Chrome Web Store, a real purchase — the agent says is yours, and never reports as done.

## Docs

- Build with an agent: https://toolaby.app/docs/agents
- Every page as Markdown: https://toolaby.app/llms.txt
- The command line: https://toolaby.app/docs/cli

This repository is generated from the Toolaby product; issues and questions: hello@toolaby.app.
