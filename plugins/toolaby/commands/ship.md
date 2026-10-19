---
description: "Prepare this extension for the Chrome Web Store with Toolaby: Live key, build, zip"
argument-hint: "[version]"
---

Prepare this Chrome extension for the Chrome Web Store: $ARGUMENTS

Use the toolaby-ship skill: `toolaby_copy_to_live` (it needs the person to have run `npx -y toolaby@latest login --live` once), `npx -y toolaby@latest upgrade <tool> --live`, raise the version, build, `npx -y toolaby@latest check --json` on the build (no TEST_KEY_IN_LIVE_BUILD), then `npx -y toolaby@latest pack`. The upload, the listing and the review are the person's: say so, and set the listing address afterwards with `toolaby_update_tool` (--live).
