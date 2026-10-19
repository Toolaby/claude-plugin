---
name: toolaby-ship
description: "Ships a Toolaby extension to the Chrome Web Store: Copy to Live, `login --live`, `upgrade --live` for the Live key, the version, `pack` for the store zip, the person's upload, then the listing address with `tool update --store-url`. Use when the user says ship, release, publish, go live, Live key, production, store build, zip, Chrome Web Store, or a new version."
---

# Ship to the Chrome Web Store

Read `TOOLABY.md` at the project's root first: the files Toolaby owns, where `toolaby.js` is imported from in this kind of project, the tool's plans and features now, and the rules. No `TOOLABY.md`: the extension is not wired yet (the toolaby skill says how).

1. The person connects Stripe on Live: `toolaby_stripe_status` (`npx -y toolaby@latest stripe --live`) says whether it is, and gives the link.
2. Both sessions: `npx -y toolaby@latest login` and `npx -y toolaby@latest login --live`, each approved once by the person.
3. Copy to Live: `toolaby_copy_to_live` (`npx -y toolaby@latest copy-to-live <tool>`), or the tool's Set up page on Test, at its foot. It copies the Free plan, features, plans, versions and the extension's identity. Customers, keys and endpoints stay on their side. Plans are copied only once Stripe takes payments on Live: copied before, copy again after step 1. The answer's `dashboard` is the tool's page on Live, which lists what is left.
4. `npx -y toolaby@latest upgrade <tool> --live`: the Live key and the Live address. A Plasmo project replaces `package.json`'s `manifest` with the lines it prints.
5. Raise the version: `version` in `manifest.json`, or in `package.json` for WXT and Plasmo. The store refuses one that is not higher.
6. Build, then `npx -y toolaby@latest pack [built folder]`: `<name>-<version>.zip`, the manifest's `key` left out. It refuses a Test key, `localhost`, and another workspace's address, and leaves private files out.
7. The person uploads the zip in the Chrome Web Store Developer Dashboard and submits it for review.
8. After the first upload: `npx -y toolaby@latest tool update <tool> --store-url <listing address> --live`.
9. Back to development on Test: `npx -y toolaby@latest upgrade <tool>`.
10. `toolaby_get_tool` on Live: `sale` says *On sale*, or what still stops a sale (`fix`: `stripe` or `price`).

More: https://toolaby.app/docs/ship.md · https://toolaby.app/docs/test-and-live.md · https://toolaby.app/docs/versions.md

## Verify

1. `npx -y toolaby@latest check --json --live [--built <dir>]`: exits `0`, no `TEST_KEY_IN_LIVE_BUILD`.
2. `toolaby_get_tool` with `--live` (`npx -y toolaby@latest tool get <tool> --live --json`): the tool and its plans are on Live.
3. Tell the person the steps left: upload, submit, then a real purchase on Live.
