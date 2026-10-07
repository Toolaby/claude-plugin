---
name: toolaby-extensionpay-move
description: "Moves an extension from ExtensionPay (ExtPay, extpay, extensionpay.com) to Toolaby: `wire --from-extensionpay` keeps the ExtPay calls working through Toolaby and copies the plans; then the person copies customers in Stripe, makes a restricted key, moves subscriptions under Import, imports one-time buyers from a CSV, and copies the tool to Live. Use when the code imports extpay or ExtPay.js, or the user mentions ExtensionPay, ExtPay, or moving paying users."
---

# Move from ExtensionPay

Read `TOOLABY.md` at the project's root first: the files Toolaby owns, where `toolaby.js` is imported from in this kind of project, the tool's plans and features now, and the rules. No `TOOLABY.md`: the extension is not wired yet (the toolaby skill says how).

1. The tool, on Test: `npx -y toolaby@latest tool create --name "…"` if there is none.
2. Ask your person which paywall people meet first: Toolaby's sign-in and plans, before their popup when they may not use it yet (recommended), or ExtensionPay's page, as it was. Then, in the extension's folder: `npx -y toolaby@latest wire <tool> --from-extensionpay --toolaby-popup`, or `--own-popup`. Without one of them and with no terminal, `wire` stops and writes nothing; without `--from-extensionpay`, it stops when it finds ExtensionPay.
3. Keep the `ExtPay('…')` calls: Toolaby answers `getUser()`, `getPlans()`, `openPaymentPage()`, `openTrialPage()`, `onPaid` and the rest. The plans were copied with their nicknames as tiers, which `openPaymentPage('pro')` finds.
4. Fix what `wire` lists to change by hand. A bundle with ExtensionPay inside (`dist/…`) is switched by building it again from the switched source.
5. No `extpay` import, ExtensionPay host or extensionpay.com content script may be left: search the code and the manifest.

The person's steps, in order, before the switched build is published:

1. Connect Stripe on Live, then Copy to Live (`npx -y toolaby@latest copy-to-live <tool>`).
2. In the old Stripe account: **Customers → Copy customers**, to the account under **Configure → Payments**.
3. A restricted key on the old account, with the permissions the move page lists.
4. On Live, the tool's **Import → From another Stripe account**: read, choose a plan for each price, move.
5. One-time buyers: payments exported from Stripe as CSV, one row per address, the column named `email`; imported as licences under **Import**.
6. Publish the update right after the move. Keep ExtensionPay connected until the last old subscription has ended.

More: https://toolaby.app/docs/extensionpay.md · https://toolaby.app/docs/move-subscriptions.md · https://toolaby.app/docs/migrate.md

## Verify

1. `npx -y toolaby@latest check --json` exits `0` with `ok: true`; for each `error` finding, run its `fix`, or change what its `message` says.
2. `toolaby_get_tool`: the copied plans, with ExtensionPay's nicknames as tiers.
3. Build, then `npx -y toolaby@latest check --browser [--built <dir>]`: the background answers, and `ExtPay`'s `getUser()` answers `paid: false` on the Free plan.
4. List the person's six steps above in your final message, as steps.
