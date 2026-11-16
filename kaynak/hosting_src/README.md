# Tidewater Live

Paper trading with real prices: crypto live, the whole US stock market (15 minutes delayed), 6 learning bots that trade by themselves, news, earnings and the economic calendar. Play money only; not financial advice.

**Free to run:** a static site on GitHub Pages, plus a scheduled GitHub Actions job that runs the bots every 5 minutes. No paid service and no API keys.

## Kurulum (Türkçe)

1. GitHub'da **herkese açık (public)** yeni bir depo aç, örneğin `tidewater-live`. Depo herkese açık olmalı; GitHub Actions dakikaları ancak öyle ücretsiz ve sınırsız.
2. Bu klasördeki her şeyi deponun köküne yükle (`index.html`, `server/`, `.github/` ve diğerleri).
3. **Settings → Pages:** "Deploy from a branch", dal `main`, klasör `/ (root)` → Save. Birkaç dakika sonra site `https://KULLANICIADIN.github.io/tidewater-live/` adresinde açılır.
4. **Settings → Actions → General → Workflow permissions:** "Read and write permissions" seç ve kaydet. Botlar durumlarını `data` dalına bu sayede yazar.
5. **Actions** sekmesinde "bots" iş akışını açıp **Run workflow** ile ilk çalıştırmayı başlat. Sonra GitHub onu kendi kendine 5 dakikada bir çalıştırır (yoğunlukta 10–15 dakikada bir).

6. Aynı şekilde "arena" iş akışını da bir kez **Run workflow** ile başlat (yaklaşık 40 dakika sürer). Sonra her gece kendi çalışır: Bot Arenası’nı (son 90 gün) ve Strateji Masası’nın 2018’den bugüne testini yeniler. Büyük indirme önbelleği GitHub’ın Actions önbelleğinde tutulur, `data` dalına yazılmaz.
7. **İsteğe bağlı, telefon bildirimleri:** telefonuna ücretsiz **ntfy** uygulamasını kur. Sitede Ayarlar → Telefon bildirimleri’nden rastgele bir konu adı üret ve uygulamada o konuya abone ol. Sonra GitHub’da **Settings → Secrets and variables → Actions → Variables** altında `NTFY_TOPIC` adlı bir değişken oluşturup aynı adı yaz. Sunucu, bir Masa stratejisi elindekileri değiştirdiğinde sana mesaj atar. Konu adını kimseyle paylaşma.

Site GitHub Pages'te açılınca botları kendisi çalıştırmaz; `data` dalındaki durumu okur. Sayfa kapalıyken de botlar işlem yapmaya ve öğrenmeye devam eder. Telefonda tarayıcı menüsünden "Ana ekrana ekle" ile uygulama gibi yükleyebilirsin.

## Setup (English)

1. Create a new **public** repository on GitHub, for example `tidewater-live`. Actions minutes are free and unlimited only for public repositories.
2. Upload everything in this folder to the repository's root.
3. **Settings → Pages:** "Deploy from a branch", branch `main`, folder `/ (root)`. The site appears at `https://YOURNAME.github.io/tidewater-live/`.
4. **Settings → Actions → General → Workflow permissions:** choose "Read and write permissions", so the job can save to the `data` branch.
5. In **Actions**, open the "bots" workflow and press **Run workflow** once. GitHub then runs it every 5 minutes on its own (best effort, sometimes 10 to 15).
6. Run the "arena" workflow once the same way (about 40 minutes); then it runs every night.
7. **Optional, phone notifications:** install the free **ntfy** app. In the site, Settings → Phone notifications, make a random topic name and subscribe to it in the app. Then in GitHub, **Settings → Secrets and variables → Actions → Variables**, add a variable `NTFY_TOPIC` with the same name. The server messages you when a Desk strategy changes its holdings. Keep the topic name private.

## What runs where

| Part | Where | Data |
|---|---|---|
| Site, your account, your own strategy bots | Your browser | Binance, Coinbase, TradingView screener, CoinGecko, alternative.me, Dow Jones RSS, rss2json, SEC EDGAR |
| The 6 bots | GitHub Actions every 5 minutes → `data/state.json` | Binance 5-minute candles, TradingView screener |
| Economic calendar | Same job, every 3 hours → `data/calendar.json` | ForexFactory (this week), Nasdaq (the days after) |
| Bot Arena | GitHub Actions once a day → `data/arena.json` | Binance 5-minute candles, OKX futures data |
| Strategy Desk test (30 coins since 2018) | Same daily job → `data/daily.json` (download cache in the Actions cache) | Binance daily candles, Binance funding-rate archive |
| Forward test (each Desk strategy's holdings, every day, never changed) | The 5-minute job, once a day → `data/forward.json` | Binance daily candles |
| Order-book record | The 5-minute job → `data/obi.json` (30 days); the daily job keeps the long record in the Actions cache | Binance order book (top 20 levels) |

Start the "arena" workflow once by hand after the first "bots" run (step 5); it then runs every night. GitHub keeps an Actions cache for 7 days without use; the daily job uses it every day.

Some of these sources (the TradingView screener, rss2json, the Nasdaq calendar) are free services that are not official public APIs; they can change or stop.

## Kaynak kod / Source

`kaynak/` klasörü sitenin ve botların tüm kaynağıdır: kod (`live/`, `ai_*.js`, `sim_live*.js`, `live_broker.js`, `strategy.js`), sunucu (`server/`), veriler (`data/`), testler (`ds/`) ve build betikleri. Deponun kökündeki dosyalar oradan üretilir; değişikliği `kaynak/` içinde yap, sonra yeniden üret:

The `kaynak/` folder is the full source of the site and the bots. The files at the repository root are built from it; change things in `kaynak/`, then rebuild:

```bash
cd kaynak && python3 build_live.py && python3 build_hosting.py && cp -r hosting/. ..
```
