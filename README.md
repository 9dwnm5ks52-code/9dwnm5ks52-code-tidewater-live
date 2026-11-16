# Phoenix Finance Club

A high-school finance club's **shared paper-trading fund**: one account, $100,000 of play money, real prices (crypto live from Binance, US stocks and ETFs 15 minutes delayed from TradingView's screener), market, limit and stop orders, and short selling. Everything about the fund — holdings, value, performance against the S&P 500, open orders and every trade with its note — is public on the website. Only club members can trade, and no names are shown anywhere ("Phoenix Finance Club" trades). Play money only; not financial advice.

**Free to run:** a static site on GitHub Pages plus one GitHub Actions workflow (`club`). No paid service, no server, no database, no AI.

## Kurulum: kulüp yöneticisi (Türkçe)

1. **Depo bir GitHub organizasyonunda olsun (önerilir).** Ücretsiz bir organizasyon aç (örneğin `phoenix-finance-club`) ve depoyu oraya taşı ya da orada aç. Neden: üyelerin "fine-grained" token'ları sadece kendi hesaplarının ya da üyesi/ortak çalışanı oldukları organizasyonların depolarını seçebilir; kişisel bir hesaptaki depoyu başkasının token'ı seçemeyebilir.
2. Depo **herkese açık (public)** olsun (GitHub Actions dakikaları ancak öyle ücretsiz ve sınırsız). Bu klasördeki her şeyi deponun köküne koy (`index.html`, `server/`, `.github/` ve diğerleri).
3. **Settings → Pages:** "Deploy from a branch", dal `main`, klasör `/ (root)`. Site `https://ORGANIZASYON.github.io/DEPO/` adresinde açılır.
4. **Settings → Actions → General → Workflow permissions:** "Read and write permissions" seç. Fon, `data` dalındaki `fund.json` dosyasına bu sayede yazılır.
5. **İlk çalıştırma:** **Actions** sekmesinde "club" iş akışını açıp **Run workflow** (dal `main`, kutuları boş bırak) ile bir kez başlat. Bu, $100.000'lık fonu ve `data` dalını oluşturur. Sonra GitHub onu kendi kendine yaklaşık 5 dakikada bir çalıştırır (yoğunlukta 10–15 dakika): bekleyen limit/stop emirleri kontrol edilir, fonun değeri S&P 500 ve Bitcoin ile birlikte kaydedilir, ekonomik takvim yenilenir.
6. **Üye eklemek:** Settings → Collaborators (organizasyonda: People / Teams) → üyenin GitHub kullanıcı adını ekle, **Write** yetkisi ver. Üye e-postadaki daveti kabul eder. Üyeliği bitince aynı yerden çıkar; token'ı o anda işe yaramaz hale gelir.
7. **Gizlilik:** site hiçbir isim ya da kişisel veri saklamaz ve işlemlerde isim göstermez. **Ama GitHub, Actions sayfasında her çalıştırmayı hangi hesabın başlattığını gösterir** ve depo herkese açıktır. Bu yüzden üyeler gerçek adlarını içermeyen GitHub kullanıcı adları kullanmalı (örneğin `phoenix-trader-7`). Kişisel bilgiyi notlara yazmamalarını da hatırlat: notlar herkese açıktır.

## Üyeler: token nasıl alınır

1. Yöneticinin davetini kabul et (yukarıdaki 6. adım).
2. GitHub'da: profil resmin → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
3. **Resource owner:** kulübün deposunun sahibi (organizasyon). **Repository access:** "Only select repositories" → sadece kulübün deposu. **Permissions → Repository permissions → Actions: "Read and write"** (Metadata: read kendiliğinden eklenir). Başka hiçbir izin verme. Bir bitiş tarihi seç (örneğin dönem sonu). Organizasyon onay istiyorsa yönetici token'ı onaylar.
4. Sitede **Ayarlar → Üye girişi**'ne token'ı yapıştır, **Kaydet**, sonra **Kontrol et**. Token sadece o tarayıcıda (localStorage) kalır ve sadece api.github.com'a gönderilir. **Token'ı asla sohbete, e-postaya ya da başka bir yere yapıştırma.** Ortak bilgisayarda işin bitince **Sil**'e bas.

## Setup: club admin (English)

1. **Put the repository in a GitHub organization (recommended).** Create a free organization (for example `phoenix-finance-club`) and create or transfer the repository there. Fine-grained tokens can only select repositories of the member's own account or of organizations they belong to (or collaborate on); a repository under someone's personal account may not be selectable.
2. Make the repository **public** (Actions minutes are free and unlimited only then) and put everything in this folder at its root.
3. **Settings → Pages:** "Deploy from a branch", branch `main`, folder `/ (root)`. The site appears at `https://ORG.github.io/REPO/`.
4. **Settings → Actions → General → Workflow permissions:** "Read and write permissions", so the job can write `fund.json` to the `data` branch.
5. **First run:** in **Actions**, open the "club" workflow and press **Run workflow** (branch `main`, leave the inputs empty). This creates the $100,000 fund and the `data` branch. GitHub then runs it about every 5 minutes by itself (best effort, sometimes 10–15): resting limit and stop orders are checked, the fund's value is recorded with the S&P 500 and Bitcoin, and the economic calendar is refreshed.
6. **Adding members:** Settings → Collaborators (in an organization: People / Teams) → add the member's GitHub username with **Write** access; they accept the e-mailed invitation. Remove them the same way when they leave; their token stops working at once.
7. **Privacy:** the site stores no names or personal data and shows no names on trades. **But GitHub shows which account started each run on the Actions page**, and the repository is public. So members should use GitHub usernames that do not contain their real names (for example `phoenix-trader-7`). Remind them that notes are public too.

## Members: how to make the token

1. Accept the admin's invitation (step 6 above).
2. On GitHub: your picture → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
3. **Resource owner:** the account that owns the club's repository (the organization). **Repository access:** "Only select repositories" → only the club's repository. **Permissions → Repository permissions → Actions: "Read and write"** (Metadata: read is added automatically). Nothing else. Pick an expiry date (for example the end of the term). If the organization requires approval, the admin approves the token.
4. On the site: **Settings → Member access**, paste the token, **Save**, then **Check**. The token stays only in that browser (localStorage) and is sent only to api.github.com. **Never paste it into a chat, an e-mail or anywhere else.** On a shared computer press **Remove** when you are done.

## How an order works

1. A member fills in the ticket (or Quick trade) and presses Buy / Sell / Short / Cover. The page checks it against the fund (cash, holdings) and, if it can work, asks GitHub to run the `club` workflow with two inputs: the order (JSON, no price) and a random client id.
2. GitHub accepts that request only from accounts with write access to the repository: being a collaborator **is** the permission to trade.
3. The workflow runs `server/club_run.sh`: it takes the `data` branch, runs `server/club.js` (strict checks, fresh prices from Binance / TradingView, the same paper broker as the site, the result stored under `done[client id]`), and pushes **without force**. If another run saved first, everything is done again on the newer data; the client id makes sure an order never runs twice.
4. The page checks `fund.json` about every 10 seconds (up to 5 minutes) and shows the result. Usually it takes about a minute.

US orders use prices about 15 minutes old and fill only while the US market is open; outside market hours, use a limit order (it waits). Crypto fee 0.1% a trade; US stocks no commission.

## What runs where

| Part | Where | Data |
|---|---|---|
| Site: the fund, charts, markets, news | The visitor's browser | `fund.json` and `calendar.json` from the `data` branch; Binance, Coinbase, TradingView screener, CoinGecko, alternative.me, Dow Jones RSS, rss2json, SEC EDGAR |
| The fund's executor (orders, limit/stop checks, value history) | GitHub Actions `club` workflow → `data/fund.json` | Binance (live), TradingView screener (15 min delayed) |
| Economic calendar | The scheduled `club` runs, every 3 hours → `data/calendar.json` | ForexFactory (this week), Nasdaq (the days after) |

The `data` branch keeps its history, so every change to the fund can be audited (`git log -p origin/data -- fund.json`). It grows by roughly a few hundred kilobytes a day.

Some sources (the TradingView screener, rss2json, the Nasdaq calendar) are free services that are not official public APIs; they can change or stop.

## Kaynak kod / Source

`kaynak/` klasörü sitenin ve fon yürütücüsünün tüm kaynağıdır. Deponun kökündeki dosyalar oradan üretilir; değişikliği `kaynak/` içinde yap, sonra yeniden üret:

The `kaynak/` folder is the full source. The files at the repository root are built from it; change things in `kaynak/`, then rebuild:

```bash
cd kaynak && python3 build_live.py && python3 build_hosting.py && cp -r hosting/. ..
```
