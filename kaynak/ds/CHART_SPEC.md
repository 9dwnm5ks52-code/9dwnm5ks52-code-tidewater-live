# Tidewater Live — pro chart for the Trade screen (shared contract)

Every agent building a piece reads this file. Each piece lives in its OWN new file; do not edit files owned by
another piece. Shared files (live/app.js, live/app.html, build_live.py, ds/t_live_app.js, live/app.css) are edited
ONLY by the integration step.

## Ground rules (from the user)
- Nothing paid, no API keys required, nothing that calls an AI at runtime. Free public data only (Binance / Coinbase
  public REST + websocket are already used by `sim_live.js`).
- No external libraries / CDNs. Plain browser JavaScript (no modules, no build step: files are concatenated in order by
  `build_live.py` into one `<script>`). Top-level `function`/`const`/`let` names are global — prefix every global with
  your piece's prefix to avoid clashes (see each piece). Never redeclare an existing global (grep before naming).
- Bilingual: every visible string goes through `L2(en, tr)` (Turkish is the user's language: write natural Turkish).
- Works at 390px phone width (no sideways page scroll), dark and light theme (use CSS tokens: `--ink --ink-2 --ink-3
  --line --line-strong --surface-1/2/3 --bg --accent --gain --loss --warn --chart-grid --f-mono`), and colour-blind
  mode (`html.cb` swaps --gain/--loss; never hard-code green/red for up/down — use var(--gain)/var(--loss)).
- Accessibility: axe must find no serious/critical problems (buttons have names, controls have labels, contrast ≥4.5:1
  for text in both themes, dialogs `role="dialog"` with `aria-modal` and a label, focus returns on close, Esc closes).
- Performance: `render()` (app.js) runs on every price tick via requestAnimationFrame. The chart must stay cheap:
  cache indicator results (key = sym|tf|bars.length|last bar t|last close|params JSON), render only the visible window,
  and never rebuild the whole DOM more than ~4×/second unless the user is interacting (zoom/pan/crosshair/draw).

## Existing helpers you may use (globals)
`$ $$ esc setHTML L2 T toast save render fpx pct p0 money cls quote(sym) ST LIVE liveDef(sym) liveQ(sym) liveJSON(url)
 liveIntra bnBar cbBar aiEMA aiRSI` — read `live/app.js`, `sim_live.js` for exact behaviour.
- A bar is `{ t, o, h, l, c, v }` (t = ms open time, ascending).
- `quote(sym)` → `{ kind:'crypto'|'stock', last, bid, ask, intra:[bars 1m], daily:[bars 1d], delayed?, ... }`.
- Crypto symbols: `liveDef(sym)` → `{ sym, bn:'BTCUSDT', cb:'BTC-USD', kind:'crypto' }`. `LIVE.src` is 'binance' or
  'coinbase'. `LIVE.BN_REST`, `LIVE.CB_REST` are the REST bases.
- The selected instrument is `ST.sel`; state `ST` is saved to localStorage by `save()`.

## State (all under `ST.chart`, created by `chInit()` in chart.js if missing)
```
ST.chart = {
  tf: '1m',            // '1m','5m','15m','1h','4h','1d','1w'
  type: 'candle',      // 'candle','hollow','heikin','bar','line','area'
  log: false,          // log price scale
  inds: [              // indicators on the chart, in order
    { k:'i1', id:'ema', p:{ n:20 }, c:{ line:'#f5a524' }, hide:false },
    { k:'i2', id:'vol', p:{}, c:{}, hide:false },
  ],
  draw: { BTC:[ /* drawings, see draw.js */ ] },
  tpl: { 'My setup':[ ...inds ] },  // saved indicator templates
  marks: true,         // show my fills as buy/sell arrows
}
```
Keep `ST.tf` in sync for old code: `ST.tf = ['1d','1w'].includes(ST.chart.tf) ? 'daily' : 'intra'`.

## Piece 1 — `live/ind.js` (prefix `IND`), pure math, no DOM
`IND_DEFS` registry: `{ [id]: { n:[en,tr], pane:'main'|'sub', p:{ name:{ v:default, min, max, step, n:[en,tr] } },
 out:{ key:{ n:[en,tr], c:'#hex default', kind:'line'|'hist'|'dots'|'band' } }, lv?:[30,70] (reference levels),
 range?:[0,100], f(bars, p) → { key:Array(len) of number|null, ... } } }`.
Outputs are arrays aligned to `bars` (null until warmed up). `kind:'band'` pairs: name two outputs `up`/`dn` and the
renderer shades between them. `kind:'hist'` draws bars from 0 (colour by sign). Also export:
- `indHeikin(bars)` → Heikin-Ashi bars.
- `indCache(key, fn)` small LRU (≤ 64 entries).
Indicators (at least): SMA, EMA, WMA, HMA, VWMA, Bollinger Bands, Keltner Channels, Donchian Channels, VWAP (resets at
UTC midnight; with ±1σ/2σ bands optional), Ichimoku (tenkan, kijun, senkou A/B shifted forward 26 → for the shift
return arrays with length bars.length and also `ahead` extra values in `IND_DEFS.ichimoku.ahead`; simpler: shift into
the same index space, dropping what falls beyond the last bar — document it), Parabolic SAR (dots), Supertrend,
Pivot points (classic, from the previous day: P,R1,R2,S1,S2), Volume (with its MA; pane 'sub', hist coloured by
candle direction — output `v` plus `dir` array of +1/-1), RSI (Wilder), MACD (12,26,9: macd, signal, hist), Stochastic
(%K 14, smooth 3, %D 3), Stochastic RSI, ATR (Wilder), ADX with +DI/−DI, CCI, OBV, MFI, Williams %R, ROC, Momentum,
CMF (Chaikin Money Flow), Aroon (up/down), TRIX, Awesome Oscillator, Linear regression channel optional.
Use standard definitions (TradingView / StockCharts). Test file `ds/t_ind.js` (node, loads `live/ind.js` in a vm
context like the other `ds/t_ai_*.js` tests): compare each indicator to an independent naive reimplementation on
fixed random-walk bars and to hand-computed values on tiny inputs; print `N/M checks passed`.

## Piece 2 — `live/chdata.js` (prefix `CD`), bars per timeframe
`cdBars(sym, tf)` → bars array (ascending) for the instrument and timeframe, or `null` while loading (it starts the
download itself, once, and calls `render()` when bars arrive). Rules:
- Crypto: Binance `/api/v3/klines?symbol=..&interval=tf&limit=1000` (Coinbase fallback: candles granularity
  60/300/900/3600/21600/86400 — 4h and 1w are aggregated from 1h / 1d). Keep the last bar live: on every call, fold the
  current `quote(sym).last` into the last bar (new bar when the period rolls over). `1m` can reuse `quote(sym).intra`.
- `cdMore(sym, tf)` loads older history (Binance `endTime` = first bar t − 1, 1000 more, cap 5000 bars) — the chart
  calls it when the user pans to the left edge.
- Stocks: aggregate `quote(sym).intra` (1m) into 5m/15m/1h/4h, `quote(sym).daily` into 1w; return what exists.
- Cache per sym|tf, refresh REST at most every 60 s (1m/5m) or 5 min (others). Never throw; network errors → keep old.
- `cdAgg(bars, ms)` exported (used by tests): aggregates bars into buckets of ms aligned to UTC (weeks start Monday).
Test file `ds/t_chdata.js` (node vm, with a stubbed `liveJSON`): aggregation correctness, live last-bar folding,
rollover, cache/refresh rules, cdMore prepends without duplicates.

## Piece 3 — `live/chart.js` + `live/chart.css` (prefix `CH`) — the engine
`chInit()` (ensures ST.chart), `chRender(host, sym)` draws everything into `host` (the `#tr-chart` element):
- One `<svg class="chart">` (keep the class: tests and `term.js` look for `#tr-chart svg.chart`) containing the main
  price pane on top and one sub-pane per `pane:'sub'` indicator below it (each ~90px, 70px on phones; main pane
  300px, 430px when `html.term`, 230px on narrow screens). Candles must be `<rect>` elements (tests count them).
- Chart types: candle, hollow candle, Heikin-Ashi, OHLC bars, line, area. Log scale toggle. Y axis labels on the right
  with "nice" ticks; time axis labels at the bottom with sensible formatting per timeframe; grid lines.
- Visible window: `CH.view = { n: bars shown (default 120, min 20, max 1000), end: index offset from the right (0 = live) }`.
  Zoom: mouse wheel / trackpad pinch (ctrl+wheel), +/− buttons, two-finger pinch on touch; pan: drag on the plot,
  one-finger drag on touch, arrow keys when the chart has focus. Double-click resets. When panned to the left edge,
  call `cdMore`. A "go to live" button appears when `end>0`.
- Crosshair: vertical + horizontal lines following the pointer, price label on the y axis, time label on the x axis,
  and a legend row at the top of each pane showing O H L C, change, volume and every indicator's value at that bar
  (or the last bar when the pointer is away). Touch: tap-and-hold shows the crosshair.
- Overlays (pane 'main') and sub-panes with reference levels (`lv`), fixed ranges (`range`), bands shaded, hist, dots.
- Last price line + coloured label on the y axis; countdown to the bar close under it.
- My fills as small ▲/▼ markers at their bar (`ST.A.fills` entries with sym, side 'b'/'s', px, t) when `ST.chart.marks`.
- Exposes coordinate API for `term.js` and `draw.js`: set the global `CHM = { lo, hi, W, H, pad, top:0, mainH, log,
  y(px) → svg y, px(y) → price, x(i) → svg x for visible index, t2x(t), x2t(x), bars (visible), i0 (first visible
  absolute index) }`. Update `live/term.js` (this piece owns that edit) so its order lines use `CHM.y`/`CHM.px` and the
  main pane height instead of its own formula; its overlay must still line up with the price pane.
- Owns the visible-window math and pointer handling only on the plot; toolbar/menus belong to Piece 4.
- `live/chart.css`: all chart styles (legend, axes, crosshair labels, pane separators, buttons on the plot like
  zoom/live). Also restyle nothing outside `.ch-*`/`#tr-chart`.
Keep `candles()` in app.js untouched (other screens may use it).

## Piece 4 — `live/chui.js` + `live/chui.css` (prefix `CU`) — toolbar, indicator picker, settings
`cuToolbar()` returns the HTML for a toolbar placed above the chart (integration puts it into `#tr-tf`'s row,
replacing the old Minutes/Days buttons). It contains:
- Timeframe buttons 1m 5m 15m 1h 4h 1D 1W (`data-ctf`), chart type menu (`data-ctype`), log toggle, "Indicators"
  button, drawing-tools button (opens Piece 5's palette via `drOpen()` if defined), templates menu, fullscreen toggle
  (`html.ch-full` makes the chart fill the screen; Esc leaves), "my trades on chart" toggle, screenshot to PNG
  (serialise the svg with computed colours inlined → canvas → download).
- Indicator picker dialog: search box, categories (Trend / Momentum / Volatility / Volume / Other — put each
  IND_DEFS id in one), click to add (multiple instances allowed), list of active ones with eye (hide), gear
  (settings), × (remove), drag or ↑↓ to reorder.
- Settings dialog per indicator: every param (number input with min/max/step) and every output colour (input
  type=color), reset to defaults. Changes apply live.
- Templates: save current set under a name, apply, delete. Ship 4 built-in templates: "Trend" (EMA 20, EMA 50, EMA 200,
  Volume), "Momentum" (RSI, MACD, Volume), "Volatility" (Bollinger, ATR, Keltner), "Ichimoku" (Ichimoku, Volume).
- All handlers via `document.addEventListener` delegation on `data-cu-*` attributes; `save(); render();` after changes.
- Quick legend actions: clicking an indicator name in the chart legend (Piece 3 renders `data-cu-ind="k"` on it) opens
  its settings.

## Piece 5 — `live/draw.js` (prefix `DR`) — drawing tools
Tools: trend line, ray, horizontal line, vertical line, rectangle, Fibonacci retracement (0, .236, .382, .5, .618,
.786, 1 with labels), parallel channel optional, text note, price-range measure (shows Δ price, Δ %, bars, time).
Drawings are stored per symbol in `ST.chart.draw[sym]` as `{ id, tool, a:{ t, px }, b:{ t, px }, c?, txt?, col }`
(time/price coordinates so they survive zoom, pan and timeframe changes). `drRender()` returns SVG markup for the
main pane using `CHM.t2x`/`CHM.y` — Piece 3 calls `typeof drRender==='function' && drRender()` and puts the result
inside the main pane group (clipped to it). Interaction: pick a tool, click-click (or drag) on the plot to place;
select a drawing to move its handles or delete (Delete/Backspace key or a × button); magnet snaps to O/H/L/C when
`ST.chart.magnet`. `drOpen()` toggles the tool palette (rendered by draw.js into the chart host). Horizontal lines
can become price alerts: a button "alert at this price" calls the existing watchlist alert API if present
(grep `live/watch.js` for how alerts are stored) — otherwise skip. While a tool is active, Piece 3 must not pan:
Piece 3 checks `typeof drBusy==='function' && drBusy()` before starting a pan.

## Integration (one step, after pieces exist)
Add files to `build_live.py` (JS order: ind.js, chdata.js after `strategy.js`; chart.js, chui.js, draw.js before
`term.js`; CSS chart.css, chui.css after pro.css). In `renderTrade` call `chRender($('#tr-chart'), ST.sel)` instead
of `candles(...)` (keep the stock "performance" fallback when there are no bars). Replace the Minutes/Days segment with
`cuToolbar()`. Translate, test (`ds/t_live_app.js` must stay green; add checks for the new chart), screenshot phone +
desktop, dark + light.
