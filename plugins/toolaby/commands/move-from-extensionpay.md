---
description: "Move this extension from ExtensionPay to Toolaby without breaking its paying users"
argument-hint: ""
---

Move the Chrome extension in this project from ExtensionPay to Toolaby, keeping its paying users.

Use the toolaby-extensionpay-move skill: make the tool, ask the person which paywall people meet first (Toolaby's sign-in and plans, recommended, or ExtensionPay's page as it was), run `npx -y toolaby@latest wire <tool> --from-extensionpay --toolaby-popup` (or `--own-popup`), compare the plans with ExtensionPay's and add any missing, check until no error, prove the unlock on Test. Then list, as the person's steps, what no tool does: copy the customers in the Stripe Dashboard, make a restricted key, Import → Move subscriptions on the tool's page, a CSV of one-time buyers, Copy to Live, a store release.
