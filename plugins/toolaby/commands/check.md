---
description: "Check this extension's Toolaby wiring and fix what it finds"
argument-hint: "[folder] [--built <dir>]"
---

Check the Toolaby wiring of the extension in this project: $ARGUMENTS

Run `toolaby_check` (or `npx -y toolaby@latest check --json`) on the folder, and on its build folder if it has one. For each finding with level "error", do what its `fix` says, or change what its `message` names, then check again until there is none. Then check with browser. Never edit the files Toolaby writes (toolaby*.js, toolaby-popup.*) by hand: `npx -y toolaby@latest upgrade <tool>` rewrites them.
