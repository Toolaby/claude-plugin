---
description: "Prove on Test that a plan unlocks its paid features, with no person and no card"
argument-hint: "[plan id]"
---

Prove on Toolaby's Test side that this extension's paid plan unlocks what it sells: $ARGUMENTS

Use the toolaby-test-a-purchase skill: `toolaby_test_unlock` for the plan (the first plan when none is named), build the extension if it has a build, then `toolaby_check` with browser and as: <plan id>. UNLOCK_OK proves it; for UNLOCK_FAILED, fix what it says and run both again. This is Test only: never on Live.
