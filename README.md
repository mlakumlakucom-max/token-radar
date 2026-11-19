# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mlakumlakucom-max/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mlakumlakucom-max/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar — the best token launch radar dashboard for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC).

It ranks every pre-token protocol in the snapshot by an implied launch value computed only from the snapshot's own figures — TVL, seven-day growth, age with no token, category and chain count — and gives each one a concrete farm plan with costs and times. The dashboard is sortable and filterable, with a detail view for every protocol showing the full record, the value-model breakdown and the farm plan. Protocols whose token already trades are set aside in a Live view with their market caps.

## Model (radar-2)

`implied = TVL x category_multiple x growth x maturity x chain`

- **Category multiple**: what share of TVL a launch is worth for that kind of protocol (trading and lending carry higher multiples than bridges or staking wrappers).
- **Growth**: `1 + clamp(change_7d, -80, 150) / 100 x 0.9` — a fast-growing protocol is worth more at the same TVL; the clamp keeps one wild week from deciding the board.
- **Maturity**: `0.7 + min(age_days, 1460) / 1460 x 0.5` — the longer a protocol has run with no token, the more "overdue" its launch reads.
- **Chain breadth**: `1 + min(chains - 1, 4) x 0.03`.

No protocol name is ever special-cased. The board covers the whole 40-protocol watchlist plus every rankable pre-token protocol below the floor.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Then serve `out/` and open `dashboard/index.html`. The page renders with no network: its data comes from `data.js` written beside it.

Referral code: mlakumlakucom-max
