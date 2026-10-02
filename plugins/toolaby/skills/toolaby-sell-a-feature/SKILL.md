---
name: toolaby-sell-a-feature
description: "Makes a feature of a Chrome extension paid (pro, premium, paywall, unlock, upgrade, locked button) with Toolaby: the plan, the feature key, and `gate({ feature })` in the code that does the work, then verifies it. Use when the user asks to make something Pro or premium, put an action behind a paywall, charge for a feature, add a free allowance or a daily limit, or lock a button until purchase."
---

# Sell a feature

Read `TOOLABY.md` at the project's root first: the files Toolaby owns, where `toolaby.js` is imported from in this kind of project, the tool's plans and features now, and the rules. No `TOOLABY.md`: the extension is not wired yet (the toolaby skill says how).

1. Read the tool: `toolaby_get_tool` (`npx -y toolaby@latest tool get <tool> --json`). Note the plan ids and the feature keys.
2. A plan that sells it, if none does: `toolaby_add_plan` (`npx -y toolaby@latest plan add <tool> --billing one_time --amount 5 --currency usd --name Pro`). The answer has the plan's id; a tool's first plan is `default`. Subscriptions, trials and seats: the toolaby-pricing skill.
3. The feature and the plans that unlock it: `toolaby_set_features`. It replaces the whole list, so send the features the tool has too.
   `npx -y toolaby@latest features <tool> --features '[{"key":"export","name":"Export to CSV"}]' --plans '[{"id":"default","features":["export"]}]'`
4. The gate, in the code that does the work, right before it:
   ```js
   const permit = await toolaby.gate({ feature: 'export' });
   if (!permit.allowed) return toolaby.showPaywall(permit); // in a page; in the background, return the permit to the page
   ```
   A Pro mark: `toolaby.has('export')`, for display only.
5. An answer with `keyChanged`: `npx -y toolaby@latest upgrade <tool>`, then rebuild and reload.

A free allowance first: free uses that never reset are Access (`npx -y toolaby@latest access <tool> --access free_uses --free-uses 10`) with `gate()` and no feature. An allowance per day is counted in code, then `gate({ feature })` past it: `TOOLABY.md`, "a daily allowance".

For an extension already in users' hands: Access and features reach installed copies at their next check, without a release. Ship the build that gates by feature before changing Access.

More: https://toolaby.app/docs/gating.md · https://toolaby.app/docs/free-plan.md · https://toolaby.app/docs/reference/client.md

## Verify

1. `npx -y toolaby@latest check --json` exits `0` with `ok: true`; for each `error` finding, run its `fix`, or change what its `message` says. No `FEATURE_KEY_UNKNOWN`.
2. `toolaby_get_tool`: the plan is there at the price asked and its features include the key.
3. The paid path: the toolaby-test-a-purchase skill.
