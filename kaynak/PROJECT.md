# Tidewater Live (new project)

A real-time paper trading site, built on the code of the Tidewater Exchange game (v53).

- Started from `tidewater-game-v53-backup.zip`. The game itself stays unchanged at its own link.
- Build: `bash bld.sh` writes `dist/index.html`. Tests: `bash rv_dly/reg.sh` (serves `dist/` on port 8766).
- First build here was byte-for-byte identical to the published game.

## Rules
- Nothing paid. Only free data sources; free sign-ups are fine.
- No AI or Claude calls at runtime.
- Play money only. Not financial advice. Real data is labelled with its source and any delay.

## Data sources (all free)
| Market | Source | Key | Live? | Used for |
|---|---|---|---|---|
| Crypto | Binance public market data `data-api.binance.vision` (REST) and `data-stream.binance.vision` (WebSocket) | none | yes | prices, 24 h change, order book top levels, trades, candles |
| Crypto (backup) | Coinbase Exchange `api.exchange.coinbase.com`, `ws-feed.exchange.coinbase.com` | none | yes | if Binance is unreachable for a visitor |
| US stocks | Alpaca free market data `data.alpaca.markets` (IEX feed), stream `stream.data.alpaca.markets/v2/iex` | free sign-up (Key ID + Secret) | yes, IEX prices (200 calls/min, live stream for up to 30 symbols) | snapshots, daily and minute bars, quotes, live trades, news |
| US stocks (backup) | Finnhub free plan `finnhub.io` | free sign-up | yes (60 calls/min, live trades for up to 50 symbols) | quotes, live trades, news |

Alpaca's data API answers browser preflights (`Access-Control-Allow-Origin: *`, allows the `Apca-Api-Key-*` headers). Free IEX prices come from one exchange, so they can differ by a few cents from the consolidated price; the site labels them "IEX".
Keys are typed by each visitor into Settings and kept only in their own browser; the site never ships a key.

Verified from a browser: both crypto WebSockets stream; both REST APIs send `Access-Control-Allow-Origin: *`.
`api.binance.com` refuses some countries (451), so the public mirror is used.

## Hosting
claude.ai artifact pages cannot open connections to outside data services, so the live site is hosted as a static site (free: GitHub Pages, Vercel or Netlify). The game stays on its artifact link.

## Engine plan ("live mode" on the existing engine)
1. **Universe:** real symbols replace the fictional companies: crypto first (BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, LINK, DOT, LTC, TRX), US stocks next.
2. **Prices:** every update writes the real last price, the real best levels of the order book and real trades into each instrument, so the existing screens (Board, chart, ticket, order journey, execution desk) keep working on real numbers.
3. **Paper broker:** your market orders walk the real book levels at that moment; limit and stop orders fill when the real price crosses them; fees are shown.
4. **Bots:** the bot funds stay as rival paper portfolios that trade on real prices, so the league race is "you against the bots on the real market".
5. **Time:** the real clock. Crypto sessions are UTC days; US stocks follow New York market hours.
6. **Removed:** fictional news, the neighbouring country, storms, fictional earnings, IPOs and splits. Hidden real years stay as a replay mode.
