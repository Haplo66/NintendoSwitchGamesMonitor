# Nintendo Switch Games Monitor

A free-only service that watches Nintendo Switch game deals, analyzes discount opportunities, and delivers a curated, family-friendly **daily digest email** whenever something worth buying shows up.

## Project Purpose

Track Nintendo Switch game prices and sales, score the "quality" of each deal for the household, and deliver a curated, family-friendly notification. The service is designed to run entirely for free — no paid APIs, no hosted infrastructure — using scheduled GitHub Actions and free email delivery.

## Architecture

- **Free-only** — data collection relies on free/unofficial Nintendo endpoints and open web sources; no paid APIs.
- **GitHub Actions execution** — the monitor runs on a schedule (cron) in GitHub Actions, so there is no server to maintain or pay for.
- **HTML email notifications** — results are delivered as formatted HTML emails via Gmail SMTP (free tier).

## Tech Stack

- Node.js + TypeScript
- dotenv for environment configuration
- nodemailer for SMTP delivery
- GitHub Actions for scheduled execution

## Email Notification System

Notifications follow a clean pipeline so each concern can evolve independently:

1. **Models** (`src/models/`) — generic domain types such as `Game`, `DailyDigest`, and `NotificationSettings`. They hold no presentation logic, so collectors and analyzers can feed them later without touching the email code.
2. **Digest builder** (`src/notifications/daily-digest-builder.ts`) — `buildDailyDigest(result)` turns a `MonitorResult` into a `DailyDigest`, applying the digest settings (caps on best deals and wishlist alerts, and whether price watch and statistics are shown).
3. **Template** (`src/notifications/email-template.ts`) — pure builder functions that turn digest data into HTML blocks (header, summary, wishlist alerts, best deals, free games, family recommendations, price watch, statistics, footer). All styling is inline CSS because email clients strip `<style>` blocks and external stylesheets.
4. **Renderer** (`src/notifications/email-renderer.ts`) — composes the blocks into a complete HTML email document (`renderDigestEmail(digest)`).
5. **Provider abstraction** (`src/notifications/email-provider.ts`) — a single `EmailProvider` interface (`sendEmail({ subject, html })`) so Gmail can be swapped for another provider later without changing callers.
6. **Gmail provider** (`src/notifications/gmail-provider.ts`) — a concrete SMTP implementation built on nodemailer. It owns its Gmail defaults (`smtp.gmail.com:465`, implicit TLS), reads the `SMTP_USER` / `SMTP_PASSWORD` secrets from `.env`, and always sends **from** `SMTP_USER` (there is no `MAIL_FROM`).
7. **Mock provider** (`src/notifications/mock-email-provider.ts`) — a test double that implements the same interface but never sends a real email. It captures the message in memory (and optionally writes the rendered HTML to disk) for verification.
8. **Provider factory** (`src/notifications/email-factory.ts`) — `createEmailProvider()` selects the active provider from the `emailProvider` preference (`gmail` or `mock`), overridable by `EMAIL_PROVIDER` for one run. No caller knows which concrete provider it gets, and the renderer never does.

```
EmailProvider
    |
    +-- GmailProvider   (real SMTP delivery)
    |
    +-- MockEmailProvider (local testing / CI validation)
```

### Daily Digest layout

The notification email is a **daily digest** written for a busy parent. It opens with a one-glance summary, then walks through the deals worth their attention:

1. **Header** — Nintendo red banner with the app name, formatted date, and the collector used.
2. **Today's Summary** — a quick stats bar: new deals today, wishlist games on sale, still-active deals, the biggest discount, and games checked.
3. **Wishlist Watch** — every game on the family wishlist with today's price and its current status: 🔥 **On Sale**, 🎯 **Target Price Reached**, ⚪ **Full Price** (monitored but not currently discounted — its regular price is still shown), or ⚪ **Not Currently Tracked** (not part of the monitored catalog, so no price tracking). Each monitored game shows **Current Price:** (with a struck-through **Regular:** price and 🔥 discount % when on sale) and its target. Each non-tracked game shows *"Add this game to the monitored catalog to enable price tracking."* It always renders, so an empty wishlist is shown explicitly.
4. **Still On Sale** — deals the family has already been notified about that are *still* discounted (and not re-reported today), with how long each has been on sale (`First reported <date> · N days on sale`). Hidden when there are no still-active tracked deals.
5. **Wishlist Alerts** — games on the family wishlist whose price target was reached (or any discount, when enabled). Each alert shows current/original price, discount %, the target and where it came from (`Configured target` vs `Auto target (N% discount)`), and a store link.
6. **Best Deals** — the highest-scoring non-wishlist deals, each with price, discount badge, deal score, and why it's recommended.
7. **Free Games** — free-to-download games, nothing to buy.
8. **Recommended For Your Family** — one short list per family profile showing which matching games are worth checking **today**. Only actionable games are recommended: currently discounted, free, or active deals still on sale. Each recommended game shows its price status (e.g. 🔥 **-90%** with the current price, or 🆓 **Free to download**). Full-price catalog games are never recommended, even if they match a profile or sit on the wishlist — those stay in **Wishlist Watch** (⚪ Full Price) instead.
9. **Price Watch** (optional) — wishlist items currently above their target but within ~10% of it, so you can see which deals are about to happen.
10. **Monitoring Statistics** (optional) — games checked/reported/skipped, the collector, and execution time.
11. **Footer** — a muted "generated automatically" note.

Content sections that have nothing to show are hidden entirely, so an empty day arrives as a short, honest email — except **Wishlist Watch** and **Today's Summary**, which always render so you can see at a glance that nothing new happened. The subject line summarizes the whole digest: `🎮 Nintendo Switch Daily Digest — N game(s) worth checking`. The HTML and Markdown reports use the exact same section order.

### Testing without SMTP credentials

Set `emailProvider: "mock"` in `data/settings.json` (or override with `EMAIL_PROVIDER=mock` for one run) and run:

```bash
npm run validate-email
```

This runs a self-contained validation suite with no external services:

- verifies HTML output is generated (doctype, full document)
- verifies HTML escaping protects against injected markup
- verifies every digest section renders (header, Today's Summary, wishlist watch, still on sale, wishlist alerts, best deals, free games, family recommendations, price watch, statistics, footer)
- verifies empty sections disappear gracefully (while summary and wishlist watch always render)
- verifies an email can be captured by `MockEmailProvider`

It always succeeds without any SMTP credentials, making it safe for local runs and future GitHub Actions validation. The mock provider also writes the rendered email to `data/emails/` (default) so you can open it in a browser.

### Sending a test email

```bash
npm run test-email
```

This builds the project, generates a sample `DailyDigest`, renders it to HTML, and sends it using the configured `emailProvider` preference. With `gmail` (default) it sends a real email via Gmail SMTP using the `SMTP_USER` / `SMTP_PASSWORD` secrets (recipient is `emailTo`, falling back to `SMTP_USER`); with `mock` it captures the message locally instead — handy for previewing without touching a real inbox.

### Configuration philosophy

Configuration splits across four layers — each value lives in exactly one place:

```
.env                 secrets only (SMTP_USER, SMTP_PASSWORD, optional NODE_ENV)
data/settings.json   user preferences + notification settings
provider/collector   provider-specific defaults (Gmail SMTP host/port, catalog path, …)
command line / CI    one-time execution modes (--dry-run / --force-email)
```

#### Secrets — `.env`

| Variable | Description |
| -------- | ----------- |
| `SMTP_USER` | Gmail address used for SMTP authentication. It is also the email **From** address — there is no separate `MAIL_FROM` (single source of truth). |
| `SMTP_PASSWORD` | Gmail App Password (regular account passwords are rejected by Gmail). |
| `NODE_ENV` | Optional. `development` by default. |

The Gmail SMTP host/port (`smtp.gmail.com:465`, implicit TLS) are **built into the Gmail provider** — you never configure them. `MOCK_EMAIL_OUT_DIR` (default `data/emails`) controls where the mock provider saves rendered HTML.

#### Everything else

User preferences (`platform`, `emailProvider`, `gameCollector`, `logLevel`, `emailTo`) and notification settings live in `data/settings.json` (see [User preferences](#user-preferences--datasettingsjson)). The digest recipient comes **only** from `emailTo` in `data/settings.json`, falling back to the sender (`SMTP_USER`) — there is no `EMAIL_TO` environment variable. `DRY_RUN` / `FORCE_EMAIL` are **one-time execution modes**, not configuration: pass them per run on the command line (`npm run monitor -- --dry-run`) or as GitHub Actions inputs, and they never persist.

#### Optional environment overrides (CI / command line)

For CI or a one-off run, these environment variables are honored and take precedence over `data/settings.json`: `EMAIL_PROVIDER`, `GAME_COLLECTOR`, `NINTENDO_PLATFORM`, `LOG_LEVEL`, plus the notification/collector overrides below. Keep them out of `.env` unless you have a temporary reason to set one.

| Variable              | Overrides (settings.json key)                                              | Default       |
| --------------------- | ------------------------------------------------------------------------ | ------------- |
| `NINTENDO_PLATFORM`   | `platform` (console: `switch1`, `switch2`, or `both`)                     | `switch1`     |
| `EMAIL_PROVIDER`      | `emailProvider` (`gmail` or `mock`)                                       | `gmail`       |
| `GAME_COLLECTOR`      | `gameCollector` (`mock` or `nintendo`)                                    | `mock`        |
| `LOG_LEVEL`           | `logLevel` (`debug`, `info`, `warn`, `error`, `silent`)                   | `info`        |
| `NINTENDO_REGION`     | — (eShop region, `US` only)                                               | `US`          |
| `GAME_CATALOG`        | — (game catalog JSON path)                                                | `data/game-catalog.json` |
| `DEALS_CURRENCY`      | — (currency expected from the price API)                                  | `USD`         |
| `DEALS_LIMIT`         | — (max games per run for the `nintendo` collector)                        | `100`         |
| `MIN_DEAL_SCORE`      | `minimumDealScore`                                                        | `80`          |
| `NOTIFICATION_COOLDOWN_DAYS` | `notificationCooldownDays`                                          | `14`          |
| `MAX_GAMES_PER_EMAIL` | `maxGamesPerEmail`                                                        | `10`          |
| `NOTIFY_FREE_GAMES`   | `notifyFreeGames`                                                         | `true`        |
| `NOTIFY_WISHLIST_MATCHES` | `notifyWishlistMatches`                                                | `true`        |
| `DEFAULT_WISHLIST_DISCOUNT_PERCENT` | `defaultWishlistDiscountPercent`                          | `40`          |
| `DEFAULT_NOTIFY_ON_ANY_DISCOUNT` | `defaultNotifyOnAnyDiscount`                                  | `false`       |
| `IGNORE_NOTIFICATION_HISTORY` | Test mode: bypass cooldown filtering and never write history        | `false`       |

Copy `.env.example` to `.env`, fill in the two secrets, and run `npm run test-email` with the `gmail` provider.

## Game Collection

Data collection is built behind a small abstraction so the pipeline can be developed before any real Nintendo source is wired up, and sources can be swapped later without touching the rest of the app.

1. **Models** (`src/models/game.ts`) — a generic `Game` type (id, title, prices, currency, age rating, genres, store/image URLs, source). It carries no logic, so any future source can map its data into it.
2. **Collector abstraction** (`src/collectors/game-collector.ts`) — a `GameCollector` interface (`collectGames(options)` → `Promise<Game[]>`). It is deliberately not Nintendo-specific.
3. **Mock collector** (`src/collectors/mock-game-collector.ts`) — a `MockGameCollector` that returns sample data covering a discounted game, a free game, and a kid-friendly game, letting the rest of the pipeline (analysis → notification) be built before real sources exist.
4. **Real collector** (`src/collectors/nintendo-price-collector.ts`) — a `NintendoPriceCollector` that watches a curated catalog of US games (`data/game-catalog.json`) filtered to the configured platform (`NINTENDO_PLATFORM`) and queries Nintendo's official eShop **price API** (`api.ec.nintendo.com/v1/price`) to detect current sales. It returns a `Game` per cataloged, platform-matching title that is currently discounted: current price, original price, currency (`USD`), age rating (ESRB, from the catalog), genres (from the catalog), and a canonical store URL to the US store. Games that are not on sale are ignored.

```
GameCollector
    |
    +-- MockGameCollector       (sample data)
    |
    +-- NintendoPriceCollector  (catalog + official Nintendo price API)
```

### Switching collectors

The active collector is selected with the `GAME_COLLECTOR` environment variable (default `mock`):

| Value      | Collector                                |
| ---------- | ---------------------------------------- |
| `mock`     | `MockGameCollector` — sample data, offline, default |
| `nintendo` | `NintendoPriceCollector` — real US deals via the Nintendo price API |

```bash
npm run collect-games                             # mock (default)
$env:GAME_COLLECTOR = "nintendo"; npm run collect-games   # real data
```

### Game catalog and region

The `nintendo` collector targets the **US** Nintendo eShop only (`NINTENDO_REGION=US`). It derives prices and sale status from Nintendo's **price API**, and metadata (ESRB rating, genres) from the local catalog:

- **Prices in USD** (taken directly from the price API, `currency: "USD"`)
- **US (ESRB) age ratings** and **genres** from `data/game-catalog.json`
- **Deal URLs** pointing to the canonical US store page (`nintendo.com/us/store/products/<slug>/`), where `<slug>` is taken verbatim from the catalog entry
- **Platform filtering** — only catalog entries whose `platforms` include the configured console (`NINTENDO_PLATFORM`) are collected; `both` collects every entry

Only cataloged games currently on sale and present on the selected platform are reported; games that are not discounted are skipped.

```bash
$env:GAME_COLLECTOR  = "nintendo"
$env:NINTENDO_REGION = "US";  npm run collect-games   # US deals (USD, ESRB), Switch 1 only
$env:NINTENDO_PLATFORM = "switch2";  npm run collect-games   # Switch 2 only
$env:NINTENDO_PLATFORM = "both";  npm run collect-games      # all cataloged platforms
```

`GAME_CATALOG` points the collector at an alternate catalog file. `DEALS_CURRENCY` overrides the expected currency (default `USD`).

### Maintaining the game catalog

`data/game-catalog.json` is a JSON array of the US games you want to watch. Each entry has an `nsuid` (Nintendo's regional product id), a `title`, a canonical `slug` (used verbatim to build the store URL), a `platforms` array (`switch1` / `switch2` — which consoles carry the title), and optional `genres` / `esrbRating` metadata used to enrich the reported deal:

```json
{
  "nsuid": "70010000000025",
  "title": "The Legend of Zelda: Breath of the Wild",
  "slug": "the-legend-of-zelda-breath-of-the-wild-switch",
  "platforms": ["switch1"],
  "genres": ["Adventure", "Action", "Role-Playing"],
  "esrbRating": "Everyone 10+"
}
```

- **Generate the catalog** — `npm run generate-catalog` builds the project and regenerates the catalog automatically (details below). The committed catalog currently holds **300 games**, every one with an ESRB rating and a resolvable US store page.
- **Add a game manually** — look up its US `nsuid` (e.g. via `www.nintendo.com/us/games/…` game pages or the game-guide search) and its store `slug` (the path segment of `nintendo.com/us/store/products/<slug>/`; confirm the page resolves), then append an entry. The collector will start checking it on the next run.
- **Remove a game** — delete its entry. It is no longer queried.
- **Link quality** — the collector never derives URLs from the title; it uses the catalog `slug` verbatim, so every store link is canonical and resolvable. An entry missing a `slug` is dropped.
- **Platforms** — list every console the title runs on (`switch1`, `switch2`). A game the selected `NINTENDO_PLATFORM` does not include is not collected. `both` collects every entry.
- **Correct data** — the collector trusts the catalog file (trims titles/nsuids/slugs, drops entries missing any of them, and defaults missing `platforms` to `switch1`). Run `npm run validate-collector` after editing to confirm the file parses and every entry is valid.
- **Validation** — `npm run validate-collector` also enforces structural rules on the whole catalog: no duplicate `nsuid`s, no duplicate (case-insensitive) `slug`s, no missing required fields, only valid platform values (`switch1` / `switch2`), and every entry produces a well-formed US store URL.

### Automatically generating the catalog

`npm run generate-catalog` rebuilds `data/game-catalog.json` from Nintendo's public US store sitemap and product pages:

1. **Sitemap** — `nintendo.com/us/store/sitemap.xml` lists every US store product; game slugs (those ending in `-switch` / `-switch-2`) become candidates. Non-game products (DLC, expansion passes, bundles, amiibo, hardware, memberships, …) are excluded by slug markers.
2. **Prioritized selection** — curated seed titles (the flagship Nintendo/Pokémon/indie canon) are fetched first, followed by family-keyword matches (mario, zelda, kirby, pokemon, …) in priority order, so flagship titles are never crowded out by alphabetical filler. The run targets 300 entries by default (`CATALOG_TARGET` overrides).
3. **Metadata extraction** — each product page embeds `__NEXT_DATA__`; the generator reads the embedded Apollo state to pull the title (normalized to plain ASCII), ESRB rating, and genres, and derives the platform from the slug suffix. Entries whose `nsuid` does not start with `7001` (DLC / demos / add-ons) and per-language legacy re-releases are skipped.
4. **Validation & write** — the result is validated (duplicates, required fields, platforms, URLs) and written as a sorted-by-title JSON array. The collector and the monitor never run the generator — the checked-in catalog file is what production uses, so regeneration is a maintenance action you review in git before committing.

**Wishlist priority** — when `data/wishlist.json` exists, the generator reads it first and places the **resolved wishlist games at the top** of the generated catalog (deduped by nsuid), so the exact games your family wants to watch are never starved out by alphabetical filler. Each wishlist title is resolved against the collected entries with the same conservative fuzzy matcher the analyzer uses (`"Super Smash Bros"` → `"Super Smash Bros. Ultimate"`); unresolved or ambiguous titles are reported in the run output and not injected into the catalog. A missing/unreadable wishlist file is skipped with a warning, and generation proceeds without priority ordering.

To preview a smaller/larger run: `$env:CATALOG_TARGET = "200"; npm run generate-catalog`. To write elsewhere: `$env:CATALOG_OUT = "data/my-catalog.json"; npm run generate-catalog`.

### Refreshing the existing catalog

`npm run refresh-catalog` keeps `data/game-catalog.json` up to date without blind overwrites. It runs the same generation logic as `generate-catalog`, but writes to a temporary file, diffs it against the committed catalog by `nsuid`, and prints a concise change summary instead of clobbering the file:

```
Catalog Refresh

Current games: 300
New games: 12
Removed games: 2
Updated games: 5

Added:
+ Example Game

Removed:
- Example Game

Updated:
* Example Game
  genres changed
```

- **Safe by default** — `refresh-catalog` never overwrites the committed catalog on its own. It runs as a dry run and prints the summary so you can review what changed.
- **Apply changes** — once the summary looks right, re-run with `npm run refresh-catalog -- --apply` (or `CATALOG_APPLY=true`) to write the generated catalog over `data/game-catalog.json`. Applied catalogs are re-validated (duplicates, required fields, platforms, URLs) before the file is written.
- **Stable comparison** — entries are matched by `nsuid`, so a re-titled or re-slugged game is reported as an *update*, never as a remove + add. Only `title`, `slug`, `platforms`, `esrbRating`, and `genres` are tracked; array ordering (platforms/genres) is ignored.
- **Diff module** — `src/collectors/catalog-diff.ts` exposes `diffCatalogs()` (returns `added` / `removed` / `updated`), `formatCatalogRefreshReport()` for the summary text, and `diffIsEmpty()`; reusable by any maintenance tooling.
- **Validation** — `npm run validate-refresh` covers added/removed/metadata detection, stable `nsuid` comparison, empty diffs, required-field integrity of added games, duplicate detection, and that the dry run never overwrites the committed catalog.

### Collecting games locally

```bash
npm run collect-games
```

This builds the project, runs the selected collector, and prints the collected games so you can confirm the collector layer works.

### Validating the collector

```bash
npm run validate-collector
```

Runs offline checks that confirm the default catalog loads valid entries, a game on sale maps to a correct `Game` (USD, original + current price, ESRB, deal URL), games that are **not** on sale are ignored, non-USD prices are rejected, malformed price data is rejected, and region configuration (`US` only) resolves correctly. It does not hit the network, so it is safe to run in CI.

## End-to-End Monitoring Pipeline

The pipeline (`src/pipeline/monitor-run.ts`) wires every layer into one local monitoring run:

```
Game Collector
    |
    v
Family Matching
    |
    v
Wishlist Matching
    |
    v
Deal Scoring
    |
    v
Filter worth reporting
    |
    v
Daily Digest (build + render)
    |
    v
HTML Email (provider)
```

1. **Collect** — runs the selected `GameCollector` (`mock` or `nintendo`).
2. **Analyze** — family matcher, wishlist matcher, and deal scorer produce a `GameAnalysis` per game.
3. **Filter** — only games worth reporting are kept. A game is included when it is free (if `notifyFreeGames`), matches a wishlist item (if `notifyWishlistMatches`), or its deal score reaches `minimumDealScore`.
4. **Cooldown** — games already notified for the same price within `notificationCooldownDays` are skipped, and the report is capped at `maxGamesPerEmail` games (best-scoring first).
5. **Render** — filtered games are converted into a `DailyDigest` (with run statistics) by `buildDailyDigest`, then rendered to an HTML email by `renderDigestEmail`.
6. **Deliver & track** — the email is sent via the configured `EmailProvider` (use `emailProvider: "mock"` for local testing without SMTP), then the deal history is reconciled and saved (new on-sale entries, refreshed `lastSeenOnSale`, notification counts for emailed games).

### Running a local monitor

The collector and email provider come from `data/settings.json` (`gameCollector` / `emailProvider`). To capture the digest locally instead of emailing, set `emailProvider: "mock"` (or override for one run with `EMAIL_PROVIDER=mock`):

```bash
npm run monitor
```

The rendered email is saved to `data/emails/` by default, so you can open it in a browser. When no games are worth reporting and `sendEmptyDigest` is `false` (default), the email is **skipped** and a log line confirms it. For local testing, set `IGNORE_NOTIFICATION_HISTORY=true` to bypass cooldown filtering and keep the history file untouched:

```bash
$env:EMAIL_PROVIDER = "mock"; $env:IGNORE_NOTIFICATION_HISTORY = "true"; npm run monitor
```

Execution modes are **one-time command-line flags**, not settings (see [Running Locally](#running-locally)):

```bash
npm run monitor -- --force-email   # verify Gmail delivery; sends even with 0 new notifications, never writes history
npm run monitor -- --dry-run       # rehearsal: full pipeline + HTML, but no email and no history
```

`--dry-run` is independent of `IGNORE_NOTIFICATION_HISTORY` and `--force-email`. Combination behavior is: `--force-email` still applies its cooldown filtering and sends despite 0 notifications (unless `--dry-run` is also set, which suppresses delivery); `--dry-run` always suppresses email delivery and history writes.

Every run ends with a compact summary of the decision, for example:

```
Monitor summary:
  Potential matches: 3
  New notifications: 0
  Skipped cooldown: 3
  Email: skipped (no new notifications)
```

or, with `--force-email`:

```
Monitor summary:
  Potential matches: 3
  New notifications: 0
  Skipped cooldown: 3
  Email: sent (FORCE_EMAIL=true)
```

or, with `--dry-run`:

```
Monitor summary:
  Potential matches: 3
  New notifications: 3
  Skipped cooldown: 0
  Email: not sent (DRY_RUN=true)
```

## Scheduled Execution (GitHub Actions)

The monitor runs automatically in the cloud via GitHub Actions (`.github/workflows/monitor.yml`), so there is no server to keep running:

- **Schedule** — runs once per day at 06:30 UTC via cron. Scheduled runs use **production configuration**: the collector/preferences come from `data/settings.json` (`gameCollector: "nintendo"`, `emailProvider: "gmail"`, `platform: "switch1"`), with the `SMTP_USER` / `SMTP_PASSWORD` secrets injected from GitHub. So every morning it collects the Nintendo catalog and emails the daily digest whenever there are new notifications. If a step fails, the workflow fails and the error is visible in the GitHub Actions run logs.
- **Manual dispatch** — trigger a run anytime from the **Actions** tab. Manual runs let you override the collector and email provider per run (`GAME_COLLECTOR` / `EMAIL_PROVIDER` env, both defaulting to the settings values), plus a **Dry run** toggle (default off) and a **Force email** toggle (default off) that run the full pipeline as one-time modes — dry run sends no email and writes no history; force email sends even with 0 new notifications. This is the safe way to test the whole workflow before trusting the scheduled job.
- **Steps** — checks out the repo, sets up Node.js, installs dependencies with `npm ci`, then runs `npm run monitor -- $EXTRA_FLAGS` (where `$EXTRA_FLAGS` carries `--dry-run` / `--force-email` from the manual inputs).
- **Logging** — the pipeline output shows the resolved configuration (collector, region, platform, dry-run), the number of games collected, how many were reported, and the completion status. In mock mode the rendered HTML email is also uploaded as a `monitor-emails` workflow artifact for inspection.

### Required secrets

Configure these under **Settings → Secrets and variables → Actions**. Secrets are never committed; leave unset the ones only needed for the gmail path when validating with mock mode.

| Secret             | Purpose                                        | Needed for                  |
| ------------------ | ---------------------------------------------- | --------------------------- |
| `SMTP_USER`        | Gmail address used for SMTP auth **and as the sender** | gmail mode         |
| `SMTP_PASSWORD`    | Gmail App Password                             | gmail mode                  |

The workflow also forwards the notification tuning variables as secrets so you can adjust them without editing the repo: `DEALS_CURRENCY`, `GAME_CATALOG`, `MIN_DEAL_SCORE`, `MAX_GAMES_PER_EMAIL`, `NOTIFY_FREE_GAMES`, `NOTIFY_WISHLIST_MATCHES`, `DEFAULT_WISHLIST_DISCOUNT_PERCENT`, `DEFAULT_NOTIFY_ON_ANY_DISCOUNT` — all optional with built-in defaults. The digest recipient comes from `emailTo` in `data/settings.json`, falling back to the sender (`SMTP_USER`) — there is no `EMAIL_TO` secret or environment variable. The Gmail SMTP host/port are built into the provider and are not configurable.

Manual dispatch always lets you override the provider and collector per run (`EMAIL_PROVIDER` / `GAME_COLLECTOR`), independent of the stored secrets. `NINTENDO_PLATFORM` falls back to the `platform` preference (`switch1`) when unset, so the scheduled run always filters to a concrete platform.

## Notification History & Persistent Deal Tracking

To avoid spamming the family with the same deal — and to power the **Still On Sale** and **Wishlist Watch** digest sections — the pipeline keeps a persistent deal history of every discounted game it has ever seen.

1. **History model** (`src/models/notification-history.ts`) — a `DealHistoryEntry` captures `gameTitle`, `firstSeenOnSale` / `lastSeenOnSale`, `firstNotified` / `lastNotified` / `lastNotifiedPrice`, `notificationCount`, and `currentlyOnSale`. A `DealHistory` is just `entries[]`. Models carry no logic.
2. **Storage** (`src/config/notification-history-store.ts`) — `loadDealHistory()` / `saveDealHistory()` read and write `data/notification-history.json`. A missing file initializes an empty history, a malformed file fails with a clear error, and writes always produce valid JSON. Legacy `{ records: [...] }` files are migrated automatically to deal-history entries on first load.
3. **Reconciliation** — on every real run, `reconcileDealHistory()` keeps the file accurate without ever deleting history: it creates an entry the first time a game is on sale, refreshes `lastSeenOnSale` each run, marks an entry `currentlyOnSale: false` when a sale ends (keeping the historical record), and records `firstNotified` / `lastNotified` / `lastNotifiedPrice` / `notificationCount` for every game that is actually emailed.
4. **Duplicate prevention** — before building the daily digest, the pipeline filters out games that were already notified for the **same price** within the cooldown window (`notificationCooldownDays` in `data/settings.json`, default `14`). If the price drops further, that counts as a new deal and is reported again.
5. **Recording** — after the email is delivered successfully, every game included in the digest is reconciled back into the history file (history is saved even when nothing is notified, so `lastSeenOnSale` stays fresh).

```
Reported games (threshold met)
    |
    v
Load deal history + apply cooldown filter (NOTIFICATION_COOLDOWN_DAYS)
    |
    v
Build DailyDigest  -->  render HTML  -->  send email
    |
    v
Reconcile deal history (new entries, last seen, notifications, sale end) and save
```

### Validating history logic

```bash
npm run validate-history
```

Runs checks (no external services) that confirm: empty/missing history initializes correctly, save/load round-trips valid JSON, malformed files fail clearly, legacy records migrate to entries, a new deal creates an entry, a repeated deal updates the same entry instead of duplicating it, a sale ending keeps the entry but marks it off-sale, the cooldown respects same-price notifications (and resets when the price changes or expires), and free games are tracked so they are not re-notified daily.

### Historical price tracking

The monitor also records a lightweight **price history** per game so the digest can say whether a price is historically good. Each deal-history entry carries an optional `priceHistory` — an ordered list of `{ date, price }` observations:

```json
{
  "title": "Mario Wonder",
  "priceHistory": [
    { "date": "2026-07-01", "price": 39.99 },
    { "date": "2026-08-05", "price": 34.99 }
  ]
}
```

- **What gets stored** — only *meaningful* changes are appended: the first time a game is seen on sale, a sale price change, or a sale starting again at a different price. Identical unchanged prices are never appended, so the history stays bounded (no per-day duplicates for a game that stays at the same price).
- **Migration** — existing history files without `priceHistory` load as-is (the field is optional). Legacy `{ records: [...] }` files are migrated into deal entries *and* seed a price history from each recorded notification price, with no data loss.
- **Price intelligence** (`src/history/price-intelligence.ts`) — reusable, rendering-independent helpers: `getLowestPrice`, `getHighestPrice`, `getAveragePrice`, `isLowestRecordedPrice`, and `getPriceContext` (which returns whether the current price is a new low and the previous low). Empty histories are handled safely (these return `undefined` / `false`).
- **Digest context** — deal cards (**Best Deals**, **Wishlist Alerts**, **Still On Sale**) show price context only when it is useful and add no noise otherwise:
  - When the current price is the lowest ever seen: **⭐ Lowest price seen** (optionally *· Previous low $X*).
  - Otherwise, when a cheaper price exists in history: **Lowest seen: $X**.
  - Games with no meaningful history get no price line at all.
- **Deal quality** (`src/history/deal-quality.ts`) — `evaluateDealQuality({ currentPrice, originalPrice, discountPercent, priceHistory })` turns the same history into a one-glance **rating** and reason, purely informational and independent of email rendering:
  - `excellent` — the current price is the lowest (or tied lowest) recorded → *"New lowest price"*.
  - `great` — the current price is within ~10% of the historical low → *"Near lowest price"*.
  - `good` — the current price is below the historical average sale price → *"Below average sale price"*.
  - `weak` — the current price is at or above the historical average → *"Usually cheaper"*.
  - Empty history yields no rating, so cards with no useful history show no badge. On cards, a rating badge takes precedence over the quieter price-context line (it already conveys the "new low" signal).
- **Validation** — `npm run validate-price-intelligence` covers observation recording, duplicate suppression, price-change detection, lowest/highest/average math, empty-history safety, legacy migration with a seeded price history, and digest rendering of the price context; `npm run validate-deal-quality` covers the rating rules, threshold math, empty-history safety, and digest rendering of the badge. Both suites are aggregated by `npm test`.

## Monitoring Reports

Each monitoring run can be captured as a human-readable report alongside the email (`src/reports/`):

```bash
npm run report
```

This runs the full monitoring pipeline using the **mock** email provider — no SMTP credentials required — and writes two files:

```
reports/monitor-YYYY-MM-DD-HHmm.md
reports/html/monitor-YYYY-MM-DD-HHmm.html
```

- **Markdown report** — mirrors the daily digest section order (header, Today's Summary, wishlist watch, still on sale, wishlist alerts, best deals, free games, family recommendations, price watch, statistics), then appends a **Skipped Games** section split into cooldown and below-threshold groups.

For wishlist matches, the report shows where the target price came from: **Configured target** when the item specifies `targetPrice`, or **Auto target (40% discount)** when it was computed from the game's original price and `defaultWishlistDiscountPercent`.
- **HTML report** — reuses the same digest rendering (`renderDigestEmail`) so it is readable in a browser, plus the skipped-games section.

Files are never overwritten: if a name collision occurs, a numeric suffix (`-2`, `-3`, …) is added. Reports are git-ignored runtime artifacts.

### Validating report generation

```bash
npm run validate-reports
```

Runs checks (no external services) that confirm the markdown and HTML reports are generated, reported games and their details are included, skipped games are listed, empty results are handled gracefully, and report files are written without overwriting.

## Family Profiles & Wishlist

The service is family-aware: games are matched against who lives in the household and what they want. Configuration is human-friendly — you only write the information that matters, and the application infers or defaults the rest.

### Configuration philosophy

- **No user-maintained IDs** — family profiles are identified by `name` and wishlist items by `gameTitle`. If an internal identifier is ever needed, it is generated in memory only. You never maintain IDs.
- **Minimal entries** — every optional field can be omitted from the JSON files. Missing values are populated at load time with sensible runtime defaults; your files are never modified.
- **Auto-computed values** — a wishlist item without a `targetPrice` gets an automatic target price from the game's original price and the global `defaultWishlistDiscountPercent` (runtime only, never written back).

### Family profiles

`data/family-profile.json` holds one entry per family member. Only `name` is required:

```json
[
  {
    "name": "Alex (Kid)",
    "maxAge": 10,
    "preferredGenres": ["Platformer", "Party", "Racing", "Adventure"],
    "excludedGenres": ["Shooter", "Horror"],
    "notes": "Loves Mario games; keep everything E or E10+."
  }
]
```

- `name` — **required**, unique. Used as the identifier and shown in match results.
- `maxAge` — optional age limit used as the foundation for age filtering.
- `preferredGenres` — optional genres to prioritize (defaults to `[]`).
- `excludedGenres` — optional genres to keep away from this member (defaults to `[]`).
- `notes` — optional free-form notes.

### Wishlist

`data/wishlist.json` lists the games the family wants to watch. Only `gameTitle` is required:

```json
{
  "items": [
    {
      "gameTitle": "Mario Kart 8 Deluxe",
      "targetPrice": 39.99
    },
    {
      "gameTitle": "Stardew Valley"
    }
  ]
}
```

- `gameTitle` — **required**, unique (case-insensitive). Used as the identifier.
- `targetPrice` — optional explicit buy price. When omitted, a target price is **auto-computed** after collection from the game's original price: `originalPrice × (1 − defaultWishlistDiscountPercent / 100)` (rounded to two decimals, runtime only). If no original price is known, no target is used.
- `notifyOnAnyDiscount` — optional flag to alert on any discount, even if the target price is not reached. Defaults to the global `defaultNotifyOnAnyDiscount` setting.
- `notes` — optional free-form notes.

Once a collected game's title matches a wishlist item and its price is at or below the effective target price (or any discount applies), it becomes a notification candidate.

**Title matching is conservative fuzzy** — wishlist titles are matched against the current run's analyzed games (and the game catalog, when collecting wishlist prices) using `src/matching/title-matcher.ts`. Titles are normalized (lowercase, accents stripped, ™/®/© and smart punctuation folded, non-alphanumerics collapsed to spaces), then compared as `exact` (identical) or as a contiguous token run found in **exactly one** candidate (`"Super Smash Bros"` → `"Super Smash Bros. Ultimate"`). If several candidates contain the run the title is **ambiguous** and matches nothing (`"Mario"` never resolves to Mario Kart/Party/Super Mario), and a single generic word like `"Deluxe"` never matches on its own.

### Game blacklist

`data/blacklist.json` lists titles to permanently hide from the daily digest — shovelware, inappropriate games, or anything the family is not interested in. Each entry is either a simple title string or an object with a `title` and an optional `reason`:

```json
{
  "games": [
    "Carrot Smash",
    { "title": "Example Game", "reason": "Not family-friendly" }
  ]
}
```

- `title` — **required**, unique (case-insensitive). The title string.
- `reason` — optional note about why the game is hidden (must be a string).

Matching is **exact and case-insensitive** on the normalized title (surrounding whitespace is ignored, so `"Carrot Smash"`, `"carrot smash"`, and `" Carrot Smash "` all match the same entry), and it is applied **after collection and before analysis**: blacklisted games never appear in deal analysis, **Best Deals**, **Recommended For Your Family**, or notifications, and they do not affect the **Games Checked** statistic. If a blacklisted game is also on the wishlist it stays visible in **Wishlist Watch** with today's price/status, but is still excluded from recommendations and general deals. An empty `"games"` array (or an empty blacklist file) hides nothing.

### Validating configuration

```bash
npm run validate-config
```

This loads the family profiles, wishlist, and blacklist, prints a summary, and runs checks that confirm the JSON files exist, required fields are present and unique, optional fields are populated with runtime defaults, automatic target prices are calculated correctly, explicit target prices override automatic values, and malformed configuration fails with a clear error — with no SMTP credentials or external services required.

## Analysis & Deal Intelligence

The analysis layer evaluates collected games against the family profiles and the wishlist, producing match information and a deal score — no notifications yet.

1. **Family matcher** (`src/analyzer/family-matcher.ts`) — checks a game against a family profile: age compatibility (ESRB rating vs `maxAge`), excluded genres (block), and preferred genres (positive reason). Returns `FamilyMatchResult[]` (`profileName`, `matched`, `reasons`).
2. **Wishlist matcher** (`src/analyzer/wishlist-matcher.ts`) — compares collected games to wishlist items by title and evaluates the price target. The effective target price is the item's `targetPrice` when present, otherwise it is **auto-computed** as `originalPrice × (1 − defaultWishlistDiscountPercent / 100)` at runtime. Returns `WishlistMatchResult | null` (`matched`, `wishlistItem`, `priceTargetReached`, `effectiveTargetPrice`, `targetPriceOrigin`).
3. **Deal scorer** (`src/analyzer/deal-score.ts`) — scores a deal on: discount percentage (higher = better), free games (strong bonus), wishlist match (strong bonus), and family profile matches (bonus). Returns `DealScoreResult` (`score`, `reasons`).

```
MockGameCollector
        |
        v
Family matcher  -->  Wishlist matcher
        |                 |
        v                 v
        +------ Deal scorer ------+
                     |
                     v
             Analysis report
```

### Running the analysis

```bash
npm run analyze-games
```

This builds the project, collects sample games with the mock collector, matches them against the family profiles and wishlist, scores each deal, and prints the report (matching profiles, wishlist hits, and calculated scores).

## Configuration

Configuration is centralized in `src/config/app-config.ts` (`loadAppConfig()`), which combines family profiles, wishlist, notification preferences, and collector settings into a single `AppConfig` object so individual modules do not read environment variables directly.

### Notification preferences — `data/settings.json`

User-editable notification preferences live in `data/settings.json`:

```json
{
  "minimumDealScore": 80,
  "notificationCooldownDays": 14,
  "maxGamesPerEmail": 10,
  "notifyFreeGames": true,
  "notifyWishlistMatches": true,
  "defaultWishlistDiscountPercent": 40,
  "defaultNotifyOnAnyDiscount": false,
  "sendEmptyDigest": false,
  "dailyDigest": {
    "maxBestDeals": 5,
    "maxWishlistAlerts": 10,
    "showStatistics": true,
    "showPriceWatch": true
  }
}
```

- `minimumDealScore` — minimum deal score for a game to be included in the report.
- `notificationCooldownDays` — days before the same game at the same price is notified again.
- `maxGamesPerEmail` — cap on games per email (best-scoring first when over the cap).
- `notifyFreeGames` — whether "free" alone is enough to report a game.
- `notifyWishlistMatches` — whether a wishlist match alone is enough to report a game.
- `defaultWishlistDiscountPercent` — discount percent used to compute automatic wishlist target prices (must be a whole number between `1` and `99`).
- `defaultNotifyOnAnyDiscount` — default `notifyOnAnyDiscount` for wishlist items that omit it.
- `sendEmptyDigest` — when `false` (default) and no games are reported, the digest email is **skipped** (a log line confirms it); when `true`, an empty digest is still sent.
- `dailyDigest` — layout preferences for the digest email:
  - `maxBestDeals` — how many non-wishlist deals to show in the **Best Deals** section (whole number, default `5`).
  - `maxWishlistAlerts` — how many wishlist alerts (and price-watch items) to show (whole number, default `10`).
  - `showStatistics` — whether to render the **Monitoring Statistics** section (boolean, default `true`).
  - `showPriceWatch` — whether to render the **Price Watch** section (boolean, default `true`).

The game blacklist is **not** part of `data/settings.json` — it lives in its own `data/blacklist.json` file (see [Game blacklist](#game-blacklist)).

A missing settings file falls back to the defaults; a malformed file or invalid values fail with a clear error.

### User preferences — `data/settings.json`

Application/user preferences (not secrets) also live in `data/settings.json`:

```json
{
  "platform": "switch1",
  "emailProvider": "gmail",
  "gameCollector": "nintendo",
  "logLevel": "info",
  "emailTo": "your-email@gmail.com"
}
```

- `platform` — console platform that filters the catalog before analysis: `switch1`, `switch2`, or `both` (default `switch1`).
- `emailProvider` — how the digest is delivered: `gmail` (real SMTP) or `mock` (local capture, no credentials) (default `gmail`).
- `gameCollector` — where game data comes from: `nintendo` (real US deals) or `mock` (sample data) (default `mock`).
- `logLevel` — logging verbosity: `debug`, `info`, `warn`, `error`, or `silent` (default `info`).
- `emailTo` — optional digest recipient. When omitted the digest is sent **to the sender** (`SMTP_USER`).

These are **user configuration**, not secrets — keep them out of `.env`. Set an environment variable only to override them for CI or a temporary run (`NINTENDO_PLATFORM`, `EMAIL_PROVIDER`, `GAME_COLLECTOR`, `LOG_LEVEL`). The digest recipient is **not** overridable via an environment variable: it comes only from `emailTo` (falling back to `SMTP_USER`). `dryRun` / `forceEmail` are **not** settings: they are one-time execution modes passed on the command line (see [Running Locally](#running-locally)) or as GitHub Actions inputs.

### Resolution priority

Environment variables override `settings.json` (user configuration), which overrides built-in defaults:

```
Environment variables
        |
        v
settings.json
        |
        v
defaults
```

| Setting                 | Env var                     | settings.json key             | Default       |
| ----------------------- | --------------------------- | ----------------------------- | ------------- |
| Deal score threshold    | `MIN_DEAL_SCORE`            | `minimumDealScore`            | `80`          |
| Notification cooldown   | `NOTIFICATION_COOLDOWN_DAYS`| `notificationCooldownDays`    | `14`          |
| Max games per email     | `MAX_GAMES_PER_EMAIL`       | `maxGamesPerEmail`            | `10`          |
| Notify free games       | `NOTIFY_FREE_GAMES`         | `notifyFreeGames`             | `true`        |
| Notify wishlist matches | `NOTIFY_WISHLIST_MATCHES`   | `notifyWishlistMatches`       | `true`        |
| Default wishlist discount % | `DEFAULT_WISHLIST_DISCOUNT_PERCENT` | `defaultWishlistDiscountPercent` | `40`    |
| Default notify on any discount | `DEFAULT_NOTIFY_ON_ANY_DISCOUNT` | `defaultNotifyOnAnyDiscount` | `false` |
| Game collector          | `GAME_COLLECTOR`            | `gameCollector`               | `mock`        |
| Deals per run           | `DEALS_LIMIT`               | —                             | `100`         |
| eShop region            | `NINTENDO_REGION`           | —                             | `US`          |
| Console platform        | `NINTENDO_PLATFORM`         | `platform`                    | `switch1`     |
| Email provider          | `EMAIL_PROVIDER`            | `emailProvider`               | `gmail`       |
| Digest recipient        | — (settings only)           | `emailTo`                     | `SMTP_USER`   |
| Log level               | `LOG_LEVEL`                 | `logLevel`                    | `info`        |
| Game catalog path       | `GAME_CATALOG`              | —                             | `data/game-catalog.json` |
| Deals currency          | `DEALS_CURRENCY`            | —                             | `USD`         |

`dailyDigest` and `sendEmptyDigest` are configured **only** in `data/settings.json` (no environment variables); a missing or partial `dailyDigest` block merges with the defaults above. `DRY_RUN` / `FORCE_EMAIL` are **not** in this table: they are one-time execution modes (see below), never read from `settings.json`.

### Validating settings

```bash
npm run validate-settings
npm run validate-preferences
```

`validate-settings` checks that defaults apply when the file is missing, full and partial files load correctly (including partial `dailyDigest` blocks), malformed files and invalid values are rejected, and environment variables correctly override `settings.json`. `validate-preferences` checks the user-preference fields specifically: settings values load, environment overrides settings, defaults apply when missing, invalid values are rejected, `.env.example` keeps only secrets, and the Gmail provider defaults (host/port), required SMTP credentials, and `MAIL_FROM = SMTP_USER` are correct.

## Running Locally

Configure your `.env` file first (copy `.env.example` and fill in the two secrets), then use the convenience scripts below. They all call the same existing monitor pipeline — only the execution mode changes.

| Command | Mode | What it does |
| ------- | ---- | ------------ |
| `npm run monitor` | Normal | Full pipeline: collect → analyze → build digest → send email (per `sendEmptyDigest`/cooldown rules) → record history. |
| `npm run monitor -- --dry-run` | Dry run | Full pipeline including HTML digest generation, but **no email is sent** and **notification history is not written**. |
| `npm run monitor -- --force-email` | Test email | Sends the digest even with 0 new notifications (cooldown filtering still applies) and **never writes to history** — useful to verify Gmail delivery. |

The `monitor:dry` / `monitor:test-email` wrapper scripts do the same thing as the `--dry-run` / `--force-email` flags:

```bash
npm run monitor                     # normal daily execution
npm run monitor -- --dry-run        # rehearsal: full run, no email, no history
npm run monitor -- --force-email    # force-send the digest, no history
npm run monitor:dry                 # same as --dry-run
npm run monitor:test-email          # same as --force-email
```

The distinction in one line:

- **Normal** delivers real emails and records them to `data/notification-history.json`.
- **Dry run** does everything up to delivery and then stops — safe to run anytime.
- **Test email** forces a delivery so you can confirm Gmail works, without polluting history.

These modes are **one-time per run**: they are never persisted in `.env` or `data/settings.json`, so a normal `npm run monitor` later behaves normally again. For fully offline testing set `emailProvider: "mock"` in `data/settings.json` (or override with `EMAIL_PROVIDER=mock` for one run): the digest is captured locally instead of emailed.

See [docs/PRODUCTION.md](docs/PRODUCTION.md) for the full production-readiness walkthrough.

## Getting Started

```bash
npm install
cp .env.example .env   # then fill in values
```

### Scripts

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `npm run build`      | Compile TypeScript to `dist/`                    |
| `npm run start`      | Run the compiled service (`dist/main.js`)        |
| `npm run dev`        | Run the service in watch/dev mode                |
| `npm run test-email` | Build and send a sample HTML test notification   |
| `npm run validate-email` | Build and run the email rendering validation suite |
| `npm run collect-games`  | Build and collect sample games via the mock collector |
| `npm run validate-config` | Build and validate family profiles + wishlist + blacklist config |
| `npm run validate-settings` | Build and validate notification preferences + env overrides |
| `npm run validate-preferences` | Build and validate user preferences (platform, email provider, game collector, log level, email recipient) |
| `npm run analyze-games`   | Build and analyze mock games vs profiles + wishlist |
| `npm run validate-collector` | Build and validate the game collector against real data |
| `npm run validate-history`   | Build and validate notification history + cooldown logic |
| `npm run validate-price-intelligence` | Build and validate historical price tracking (observations, lowest/highest/average, migration, digest context) |
| `npm run validate-deal-quality` | Build and validate sale-quality ratings (excellent/great/good/weak, rendering) |
| `npm run generate-catalog`   | Build and regenerate the US game catalog from the Nintendo store sitemap + product pages |
| `npm run refresh-catalog`    | Build, regenerate, and diff the catalog against the committed one (dry run; `--apply` to write) |
| `npm run validate-refresh`   | Build and validate catalog diff/refresh: added/removed/metadata, stable nsuid comparison, dry-run safety |
| `npm run monitor`       | Build and run the full monitor pipeline (collect → analyze → email) |
| `npm run monitor:dry`   | Build and run the monitor in dry-run mode (one-time `--dry-run`: no email sent, no history written) |
| `npm run monitor:test-email` | Build and run the monitor in test-email mode (one-time `--force-email`: always send the digest, no history written) |
| `npm run validate-force-email` | Build and validate test-email behavior (send empty digest, history untouched) |
| `npm run validate-dry-run` | Build and validate dry-run behavior (full pipeline + HTML generated, no email sent, history untouched) |
| `npm run report`        | Build, run the pipeline with mock email, and write a markdown + HTML report |
| `npm run validate-reports` | Build and validate report generation (markdown + HTML) |
| `npm run validate-wishlist-price` | Build and validate always-on Wishlist Watch pricing (coverage, no duplicate API requests, section order) |
| `npm run validate-title-match` | Build and validate conservative fuzzy title matching (exact/normalized/ambiguous cases, analyzer + catalog + collector + digest integration) |
| `npm run validate-blacklist` | Build and validate the game blacklist (removal, matching, wishlist exception, no notifications) |
| `npm run validate-blacklist-loader` | Build and validate the blacklist file loader (object/string entries, invalid entries, duplicates, normalization, filtering) |
| `npm run validate-recommendations` | Build and validate deal-focused family recommendations (discounted/free/active deals included, full-price excluded, price status rendered) |

## Project Structure

```
├── docs/              # Roadmap and planning docs
├── src/
│   ├── collectors/    # Game data collection
│   │   ├── game-collector.ts
│   │   ├── mock-game-collector.ts
│   │   ├── nintendo-price-collector.ts
│   │   ├── region.ts
│   │   ├── collector-factory.ts
│   │   ├── generate-catalog.ts
│   │   ├── catalog-validation.ts
│   │   ├── catalog-diff.ts
│   │   ├── refresh-catalog.ts
│   │   ├── validate-refresh.ts
│   │   ├── validate-collector.ts
│   │   └── collect-games.ts
│   ├── analyzer/      # Analysis: family/wishlist matching + deal scoring
│   │   ├── family-matcher.ts
│   │   ├── wishlist-matcher.ts
│   │   ├── deal-score.ts
│   │   └── analyze-games.ts
│   ├── matching/       # Title normalization + conservative fuzzy matching
│   │   ├── title-matcher.ts
│   │   ├── wishlist-resolver.ts
│   │   └── validate-title-match.ts
│   ├── history/        # Historical price + sale-quality intelligence
│   │   ├── price-intelligence.ts
│   │   ├── deal-quality.ts
│   │   ├── validate-price-intelligence.ts
│   │   └── validate-deal-quality.ts
│   ├── notifications/ # Email system: digest builder, templates, renderer, providers
│   │   ├── daily-digest-builder.ts
│   │   ├── email-template.ts
│   │   ├── email-renderer.ts
│   │   ├── email-provider.ts
│   │   ├── email-factory.ts
│   │   ├── gmail-provider.ts
│   │   ├── mock-email-provider.ts
│   │   ├── email-validation.ts
│   │   ├── validate-wishlist-price.ts
│   │   └── test-email.ts
│   ├── config/        # Central config (app-config) + loaders + validators + history/settings
│   ├── pipeline/      # End-to-end monitor run (collect → analyze → email)
│   ├── reports/       # Monitoring report generation (markdown + HTML)
│   ├── scripts/       # Local runner convenience (run-monitor: normal / dry / test-email)
│   ├── models/        # Shared domain types (Game, GameDeal, NotificationSettings, ...)
│   └── main.ts        # Service entry point
├── data/              # Runtime data / cache + family/wishlist/blacklist config + history + settings
│   ├── family-profile.json
│   ├── wishlist.json
│   ├── blacklist.json
│   ├── game-catalog.json
│   ├── notification-history.json
│   └── settings.json
├── reports/           # Generated monitoring reports (markdown + html/, git-ignored)
└── .github/workflows  # Scheduled execution (GitHub Actions monitor workflow)
```

### Data files

| File | Purpose | Type |
| ---- | ------- | ---- |
| `data/family-profile.json` | Family profiles (names, max ages, preferred/excluded genres) used by the analyzer | User-editable config |
| `data/wishlist.json` | Games the family wants to watch (target prices, notifications) | User-editable config |
| `data/blacklist.json` | Titles permanently hidden from the digest (with optional reasons) | User-editable config |
| `data/settings.json` | Application settings: notification preferences + user preferences (`platform`, `emailProvider`, `dryRun`, `forceEmail`, `logLevel`) | Application settings |
| `data/game-catalog.json` | US game catalog (nsuids, titles, genres, ESRB ratings, slugs) that the Nintendo collector watches | Runtime / generated data |
| `data/notification-history.json` | Persistent deal tracking + cooldown state written by monitor runs | Runtime state |

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full milestone plan.
