# Phoenix Finance Club (source)

A high-school club's single shared paper-trading fund ($100,000 of play money, real prices, every trade public, only
members trade). Built on the Tidewater Live code base; the learning bots, Strategy Desk, Arena, Lab, Academy, Challenge,
Journal, paper futures and the welcome page were removed in the club-fund rebuild (git history keeps them).

See the repository's `CLAUDE.md` for the architecture (fund.json on the data branch, server/club.js in GitHub Actions,
member trading through workflow_dispatch), the layout and the build/test commands, and `hosting_src/README.md` for the
admin and member setup.

## Rules
- Nothing paid. Only free data sources. No AI calls at runtime.
- Play money only. Not financial advice. Real data is labelled with its source and any delay.
- Members are students: no personal data stored, no names shown. Tokens never in chat, URLs, logs or fund.json.

## Data sources (all free)
| Market | Source | Key | Live? |
|---|---|---|---|
| Crypto | Binance public market data `data-api.binance.vision` (REST) and `data-stream.binance.vision` (WebSocket); Coinbase as a browser fallback | none | yes |
| US stocks and ETFs | TradingView screener `scanner.tradingview.com` (not an official API) | none | 15 min delayed |
| US stocks, optional | Alpaca free IEX feed / Finnhub, keys typed by a visitor into Settings (browser only) | free sign-up | yes (14 big names) |
| Calendar | ForexFactory weekly file, Nasdaq calendar (server) | none | — |
