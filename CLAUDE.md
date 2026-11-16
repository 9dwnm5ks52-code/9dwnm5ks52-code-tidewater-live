# Tidewater Live — notes for Claude

A paper-trading site with real prices (crypto live, US stocks 15 min delayed), a pro chart, paper futures,
6 learning bots and the Strategy Desk (daily strategies, the evidence-based part). Play money only; not advice.

## Working with the user
- Reply in Turkish, casual ("kanka"). Take initiative; be honest about results (no overfitting, say when something
  failed or is unproven). The user's goal: use the bots/strategies to support their own real-money analysis.
- Nothing paid, and no AI/Claude calls at runtime. Free public data only.
- Never ask for API keys in chat. Keys go only into the site's Settings (kept in the browser's localStorage).

## Layout
- Repository root = the published kit (GitHub Pages serves `index.html`; `.github/workflows/bots.yml` runs the bots
  every 5 min, `arena.yml` nightly; both save to the `data` branch, which the site reads).
- `kaynak/` = the full source. **Edit there**, never the root files directly.
  - `live/*.js|css|html` site UI (app.js core, chart.js/chdata.js/ind.js/chui.js/draw.js pro chart, term.js, futures.js, …)
  - `ai_bots.js`, `ai_learn.js` hourly bots; `ai_daily.js` Strategy Desk engine; `live_broker.js` paper broker
  - `sim_live*.js` data layer (Binance/Coinbase, US stocks, TradingView screener)
  - `server/` Actions scripts; `data/arena.json`, `data/daily.json` baked snapshots; `hosting_src/` kit extras

## Build, test, publish (from `kaynak/`)
```bash
python3 build_live.py          # -> dist/live.html (single file)
bash srv.sh                    # static server on 127.0.0.1:8766 serving dist/
npm i --prefix axe axe-core@4.10.2   # once, for the accessibility checks
for t in ds/t_ai_*.js ds/t_live_broker.js ds/t_perf.js ds/t_strategy.js ds/t_ind.js ds/t_chdata.js ds/t_srv_ui.js; do node $t | tail -1; done
timeout 590 node ds/t_live_app.js   # Playwright UI test, ~8 min, must stay all green
python3 build_hosting.py && cp -r hosting/. ..   # refresh the published kit at the repo root
```
Shell tip: inline heredocs / complex `python -c` can be refused by a safety check; write scripts to files instead.
