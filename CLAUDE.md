# Phoenix Finance Club — notes for Claude

A high-school finance club's single shared paper-trading fund: one account, $100,000 of play money, real prices (crypto
live from Binance, US stocks/ETFs 15 min delayed from the TradingView screener), market / limit / stop orders and short
selling, no risk rules. Everything about the fund (holdings, value, performance vs the S&P 500 and Bitcoin, open orders,
every trade with its optional note) is public on the site; only club members can trade; no names are shown anywhere.
Play money only; not advice.

## Working with the user
- Reply in Turkish, casual ("kanka"). Take initiative; be honest about results (say when something failed or is unproven).
- Nothing paid, and no AI/Claude calls at runtime. Free public data only.
- Members are high-school students: store no personal data. Never ask anyone to paste a token or API key into chat.
  Member tokens go only into the site's Settings → Member access (one localStorage key, `pfc-member-token`).

## How the shared fund works
- The fund is `fund.json` on the repo's `data` branch: a paper-broker account exactly as `live_broker.js` makes it
  (`brkNew`: cash, start, pos, orders, fills, nid, created) plus `t`, `seq`, `done {cid: result}` (last 500),
  `eq [{t, v, spy, btc}]` (every run for 2 days, hourly to 60 days, then daily), `prices {sym: last}`, `us`.
- Only `server/club.js` changes it, in GitHub Actions (`.github/workflows/club.yml`: `workflow_dispatch` with inputs
  `order`, `cid`, and every 5 min). `server/club_run.sh` checks out the data branch as a worktree, runs club.js and pushes
  without force, redoing the run on newer data if another run saved first (orders never dropped or doubled; history kept).
- The browser (`live/club.js`) sets `ST.A` to fund.json (every 60 s) and never mutates it. Members' orders are sent with
  `POST api.github.com/repos/{owner}/{repo}/actions/workflows/club.yml/dispatches {ref:'main', inputs:{order, cid}}`;
  the page then polls fund.json for `done[cid]`. Workflow dispatch needs write access: being a collaborator is the permission.
- Security: everything from fund.json (notes!) goes through `esc()` before HTML; the token is only in the Authorization
  header to api.github.com, never in URLs, logs or fund.json.

## Layout
- Repository root = the published kit (GitHub Pages serves `index.html`; `.github/workflows/club.yml`; `server/` with
  `club.js`, `calendar.js`, `club_run.sh` and `server/lib/` copies of `sim_live.js`, `sim_live_us.js`, `live_broker.js`).
- `kaynak/` = the full source. **Edit there**, never the root files directly.
  - `live/*.js|css|html` site UI: app.js core (Board, Trade ticket, Portfolio), club.js (fund loading, member access,
    dispatch and polling, trade history), srv.js (data branch URL, calendar), home.js ("Today in one look", this week),
    perf.js (performance vs SPY and BTC, the Board's range chart `boardChart`) / report.js, term.js (terminal mode and the
    fund's open orders as pill-labelled lines on the chart), chart.js / chdata.js / ind.js / chui.js / draw.js (pro chart),
    fund.js (company fundamentals `#tr-fund`), drawer.js (Portfolio's company drawer dialog and the Trade chart's click
    menu), markets.js, crypto.js, news.js, watch.js, ui.js, extras.js
  - Look: Apple-like. tokens.css holds every colour (light by default on `:root`, dark on `[data-tdx-theme="dark"]`,
    colour-blind `.cb`); app.css the layout and components (top bar, iOS tab bar on phones, cards, pills, segmented
    controls); pro.css terminal / report / palette; chart.css / chui.css the pro chart. Keep text at 4.5:1 in both themes.
  - `live_broker.js` paper broker (shared by the browser and the server); `sim_live*.js`, `sim_news.js` data layer
  - `server/` Actions scripts; `hosting_src/` kit extras (club.yml, README, manifest, sw.js)
  - `ds/` tests; `ds/srvdata/` fixtures (fund.json, calendar.json) copied to `dist/srvdata` by build_live.py

## Build, test, publish (from `kaynak/`)
```bash
python3 build_live.py          # -> dist/live.html (single file)
bash srv.sh                    # static server on 127.0.0.1:8766 serving dist/
npm i --prefix axe axe-core@4.10.2   # once, for the accessibility checks
for t in ds/t_club.js ds/t_live_broker.js ds/t_perf.js ds/t_ind.js ds/t_chdata.js ds/t_srv_ui.js; do node $t | tail -1; done
timeout 590 node ds/t_live_app.js   # Playwright UI test, ~8 min, must stay all green (uses ?srv= and a stubbed GitHub API)
python3 build_hosting.py && cp -r hosting/. ..   # refresh the published kit at the repo root
```
Test the executor against the real data sources locally with
`NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node server/club.js /tmp/somewhere` (never with a token).
Shell tip: inline heredocs / complex `python -c` can be refused by a safety check; write scripts to files instead.
