---
name: toolaby-pricing
description: "Sets the prices of a Toolaby tool: plans one-time (lifetime licence, license) or subscription (monthly, yearly), free trials, devices per buyer, per-seat team plans, coupons and discounts, and the Free plan (free uses, nothing free, account required). Use when the user mentions pricing, price, plan, tier, subscription, trial, lifetime, licence, license, team, seats, coupon, discount, store reviewer, or what is free."
---

# Pricing

Read `TOOLABY.md` at the project's root first: the files Toolaby owns, where `toolaby.js` is imported from in this kind of project, the tool's plans and features now, and the rules. No `TOOLABY.md`: the extension is not wired yet (the toolaby skill says how).

| Plan | Command (MCP: `toolaby_add_plan`) |
| --- | --- |
| Lifetime licence, $9 | `npx -y toolaby@latest plan add <tool> --billing one_time --amount 9 --currency usd --name Pro` |
| Monthly, 7-day trial | `npx -y toolaby@latest plan add <tool> --billing subscription --interval month --amount 4 --currency usd --name Pro --trial-days 7` |
| Yearly | `… --billing subscription --interval year --amount 36 …` |
| Per seat, for teams | `… --per-seat`: checkout asks *For me* or *For a team*, 2 to 100 seats |
| Devices per buyer | `… --devices 2` (1 to 10) |

- A plan's name is its tier, such as Pro: buyers read Pro · Monthly, Pro · Yearly, Pro · Lifetime, so never name a plan after its billing. Plans with the same name share a tier. Give each plan of a tier the same features: list every plan id in `toolaby_set_features`.
- A price cannot be edited: add a plan, then `toolaby_retire_plan` (`npx -y toolaby@latest plan retire <tool> <plan>`). Holders keep theirs. The `default` plan cannot be retired.
- `toolaby_update_plan` changes a plan's name, trial, devices or per seat, for the next checkouts.
- Trials are on subscriptions only, 0 to 365 days, one per inbox per tool. A trial unlocks as a paid plan does.
- The Free plan: `toolaby_set_access` (`npx -y toolaby@latest access <tool> --access open|free_uses|paid [--free-uses N] [--free-uses-per ever|day|week|month] [--sign-in-required]`). A feature a plan sells is refused on any of them. While copies are installed, a Free plan that counts uses is not opened: copies that gate with a bare `gate()` would run everything free. Ship the build that gates by feature, and leave opening it to the person after the release (`--now` then).
- A coupon, such as a free purchase for a store reviewer (the code expires in 30 days): `toolaby_create_coupon` (`npx -y toolaby@latest coupon create <tool> --percent-off 100 --code REVIEW --max-redemptions 1 --expires-days 30`). A coupon of the whole price is a pass, which the Hobby plan limits. `toolaby_grant` gives one address access with no checkout.
- An answer with `keyChanged` (the Free plan, or the first subscription plan): `npx -y toolaby@latest upgrade <tool>`, then rebuild.
- Prices are per side: Copy to Live makes them on Live (the toolaby-ship skill).

More: https://toolaby.app/docs/pricing.md · https://toolaby.app/docs/seats.md · https://toolaby.app/docs/free-plan.md · https://toolaby.app/docs/subscriptions.md

## Verify

1. `toolaby_get_tool`: each plan's amount, interval, trial, devices and per seat as asked, and the features each unlocks.
2. `npx -y toolaby@latest check --json` exits `0` with `ok: true`; for each `error` finding, run its `fix`, or change what its `message` says. No `KEY_OUTDATED`.
3. The checkout page shows the plans: `toolaby_get_tool` gives its address, for the person to look.
