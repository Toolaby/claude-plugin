---
name: toolaby-test-a-purchase
description: "Proves a paid feature unlocks on Toolaby's Test side without a person: `test-unlock` gives a Test buyer the plan, and `check --browser --as <plan>` loads the extension signed in as that buyer; also the person's test purchase with the 4242 card. Use when the user asks to test a purchase, checkout, unlock, trial or subscription, to check that the paywall works, or to verify a paid feature before shipping."
---

# Test a purchase

Read `TOOLABY.md` at the project's root first: the files Toolaby owns, where `toolaby.js` is imported from in this kind of project, the tool's plans and features now, and the rules. No `TOOLABY.md`: the extension is not wired yet (the toolaby skill says how).

On Test only: `test-unlock` is refused on Live.

## Without a person

1. Build the extension (`TOOLABY.md` says where the build goes).
2. `toolaby_test_unlock` (`npx -y toolaby@latest test-unlock <tool> --plan <id> --json`): your own Test buyer (`<you>+toolaby-test@<your domain>`) now holds the plan.
3. `npx -y toolaby@latest check --browser --as <id> [--built <dir>]`: Chromium loads the extension signed in as that buyer. The paid feature must be allowed.
4. `npx -y toolaby@latest check --browser [--built <dir>]`, without `--as`: the Free plan, where the paid feature is refused.

## With a person

- Load the extension unpacked at `chrome://extensions`, open the paywall, select Buy: the checkout page, then Stripe's. Card `4242 4242 4242 4242`, any future date, any CVC.
- Signed in before buying, the extension unlocks when the after-purchase page opens. Bought signed out: select **Sign in to unlock** on that page.
- Other outcomes (a decline, a failed renewal, a dispute) have their cards: https://toolaby.app/docs/testing.md.
- Access for one address, no checkout: `toolaby_grant` (`npx -y toolaby@latest grant <tool> <email>`); the person signs in once with it in the extension.

## Verify

1. `toolaby_get_customer` (`npx -y toolaby@latest customer <tool> <email> --json`): entitled, with the plan.
2. Never report a purchase or a sign-in the person did not make.
