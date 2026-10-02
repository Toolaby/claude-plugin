---
description: "Make a feature of this Chrome extension paid with Toolaby, and prove it unlocks"
argument-hint: "<feature> [price, like \"$5 once\" or \"$4/month, 7-day trial\"]"
---

Make this feature of the Chrome extension in this project paid with Toolaby: $ARGUMENTS

Use the toolaby-sell-a-feature skill. Search Toolaby's docs first (toolaby_search_docs). Read TOOLABY.md if the project has one; if it does not, wire the extension (`npx -y toolaby@latest wire <tool>`). Add the plan, then the feature and the plan that unlocks it; put `gate({ feature })` in the code that does the work. Before saying it is done: `toolaby_check` with no errors, then `toolaby_test_unlock` and `toolaby_check` with browser and as: <plan id>. Say plainly what only a person can do.
