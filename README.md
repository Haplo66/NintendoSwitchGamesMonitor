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
6. **Gmail provider** (`src/notifications/gmail-provider.ts`) — a concrete SMTP implementation built on nodemailer, configured entirely from environment variables.
7. **Mock provider** (`src/notifications/mock-email-provider.ts`) — a test double that implements the same interface but never sends a real email. It captures the message in memory (and optionally writes the rendered HTML to disk) for verification.
8. **Provider factory** (`src/notifications/email-factory.ts`) — `createEmailProvider()` selects the active provider from the `EMAIL_PROVIDER` environment variable (`gmail` or `mock`). No caller knows which concrete provider it gets, and the renderer never does.

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
2. **Today's Summary** — a quick stats bar: games checked, potential matches, new notifications, wishlist hits, free games, and games skipped by cooldown.
3. **Wishlist Alerts** — games on the family wishlist whose price target was reached (or any discount, when enabled). Each alert shows current/original price, discount %, the target and where it came from (`Configured target` vs `Auto target (N% discount)`), and a store link.
4. **Best Deals** — the highest-scoring non-wishlist deals, each with price, discount badge, deal score, and why it's recommended.
5. **Free Games** — free-to-download games, nothing to buy.
6. **Recommended For Your Family** — one short list per family profile showing which featured games fit each child.
7. **Price Watch** (optional) — wishlist items currently above their target but within ~10% of it, so you can see which deals are about to happen.
8. **Monitoring Statistics** (optional) — games checked/reported/skipped, the collector, and execution time.
9. **Footer** — a muted "generated automatically" note.

Sections that have no content are hidden entirely, so an empty day arrives as a short, honest email. The subject line summarizes the whole digest: `🎮 Nintendo Switch Daily Digest — N game(s) worth checking`. The HTML and Markdown reports use the exact same section order.

### Testing without SMTP credentials

Set `EMAIL_PROVIDER=mock` (or in `.env`) and run:

```bash
npm run validate-email
```

This runs a self-contained validation suite with no external services:

- verifies HTML output is generated (doctype, full document)
- verifies HTML escaping protects against injected markup
- verifies every digest section renders (header, summary, wishlist alerts, best deals, free games, family recommendations, price watch, statistics, footer)
- verifies empty sections disappear gracefully
- verifies an email can be captured by `MockEmailProvider`

It always succeeds without any SMTP credentials, making it safe for local runs and future GitHub Actions validation. The mock provider also writes the rendered email to `data/emails/` (default) so you can open it in a browser.

### Sending a test email

```bash
npm run test-email
```

This builds the project, generates a sample `DailyDigest`, renders it to HTML, and sends it. With `EMAIL_PROVIDER=gmail` (default) it sends a real email via Gmail SMTP; with `EMAIL_PROVIDER=mock` it captures the message locally instead — handy for previewing without touching a real inbox.

### Required environment variables

| Variable              | Description                                                                     |
| --------------------- | ------------------------------------------------------------------------------- |
| `SMTP_HOST`           | SMTP server host (default: `smtp.gmail.com`)                                    |
| `SMTP_PORT`           | SMTP port (default: `465` for implicit TLS; 587 is also supported)              |
| `SMTP_USER`           | Gmail address used for authentication (and the email `From` address)            |
| `SMTP_PASSWORD`       | Gmail App Password (regular account passwords are rejected by Gmail)            |
| `EMAIL_TO`            | Recipient address the notification emails are sent to                           |
| `EMAIL_PROVIDER`      | Active provider: `gmail` or `mock` (default: `gmail`)                           |
| `MOCK_EMAIL_OUT_DIR`  | Where the mock provider saves rendered HTML (default: `data/emails`)            |
| `GAME_COLLECTOR`      | Active collector: `mock` or `deku` (default: `mock`)                            |
| `DEALS_SOURCE_URL`    | Deals JSON feed used by the `deku` collector (default: Nintendo eShop sales feed) |
| `DEALS_CURRENCY`      | Currency reported by the deals source (default: `EUR`)                          |
| `DEALS_LIMIT`         | Deals fetched per run for the `deku` collector (default: `100`)                 |
| `MIN_DEAL_SCORE`      | Minimum score for a game to be included in the report (default: `80`)          |
| `NOTIFICATION_COOLDOWN_DAYS` | Days before the same game at the same price is notified again (default: `14`) |
| `MAX_GAMES_PER_EMAIL` | Cap on games included in a single email, best-scoring first (default: `10`)   |
| `NOTIFY_FREE_GAMES`   | Report games just because they are free (`true`/`false`, default: `true`)      |
| `NOTIFY_WISHLIST_MATCHES` | Report games just because they match the wishlist (`true`/`false`, default: `true`) |
| `DEFAULT_WISHLIST_DISCOUNT_PERCENT` | Discount percent used to compute automatic wishlist target prices (default: `40`) |
| `DEFAULT_NOTIFY_ON_ANY_DISCOUNT` | Default `notifyOnAnyDiscount` for wishlist items that omit it (default: `false`) |
| `IGNORE_NOTIFICATION_HISTORY` | Test mode: bypass cooldown filtering and never write to notification history (`true`/`false`, default: `false`) |
| `FORCE_EMAIL` | Test mode: always send the digest email (even with 0 new notifications) and never write to history (`true`/`false`, default: `false`) |
| `DRY_RUN` | Test mode: run the full pipeline (collect, analyze, generate the HTML digest/report) but send no email and never write to history (`true`/`false`, default: `false`) |

Copy `.env.example` to `.env` and fill in real values before running `npm run test-email` with the `gmail` provider.

## Game Collection

Data collection is built behind a small abstraction so the pipeline can be developed before any real Nintendo source is wired up, and sources can be swapped later without touching the rest of the app.

1. **Models** (`src/models/game.ts`) — a generic `Game` type (id, title, prices, currency, age rating, genres, store/image URLs, source). It carries no logic, so any future source can map its data into it.
2. **Collector abstraction** (`src/collectors/game-collector.ts`) — a `GameCollector` interface (`collectGames(options)` → `Promise<Game[]>`). It is deliberately not Nintendo-specific.
3. **Mock collector** (`src/collectors/mock-game-collector.ts`) — a `MockGameCollector` that returns sample data covering a discounted game, a free game, and a kid-friendly game, letting the rest of the pipeline (analysis → notification) be built before real sources exist.
4. **Real collector** (`src/collectors/deku-deals-collector.ts`) — a `DekuDealsCollector` that fetches live Switch game deals. DekuDeals itself offers no public API and blocks automated access, so the collector reads a JSON deals feed that is fully configurable via `DEALS_SOURCE_URL`. The default is the public Nintendo eShop sales feed (Apache Solr JSON), which provides title, current/original price, discount %, age rating, genres, image, and store URL.

```
GameCollector
    |
    +-- MockGameCollector   (sample data)
    |
    +-- DekuDealsCollector  (real deals feed)
```

### Switching collectors

The active collector is selected with the `GAME_COLLECTOR` environment variable (default `mock`):

| Value  | Collector                                |
| ------ | ---------------------------------------- |
| `mock` | `MockGameCollector` — sample data, offline, default |
| `deku` | `DekuDealsCollector` — real Switch deals from the configured source |

```bash
npm run collect-games                         # mock (default)
$env:GAME_COLLECTOR = "deku"; npm run collect-games   # real data
```

### Collecting games locally

```bash
npm run collect-games
```

This builds the project, runs the selected collector, and prints the collected games so you can confirm the collector layer works.

### Validating the collector

```bash
npm run validate-collector
```

Runs checks that fetch real data and confirm the collector returns games, every `Game` has the required fields, malformed source records are rejected, and valid records are normalized correctly.

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

1. **Collect** — runs the selected `GameCollector` (`mock` or `deku`).
2. **Analyze** — family matcher, wishlist matcher, and deal scorer produce a `GameAnalysis` per game.
3. **Filter** — only games worth reporting are kept. A game is included when it is free (if `notifyFreeGames`), matches a wishlist item (if `notifyWishlistMatches`), or its deal score reaches `minimumDealScore`.
4. **Cooldown** — games already notified for the same price within `notificationCooldownDays` are skipped, and the report is capped at `maxGamesPerEmail` games (best-scoring first).
5. **Render** — filtered games are converted into a `DailyDigest` (with run statistics) by `buildDailyDigest`, then rendered to an HTML email by `renderDigestEmail`.
6. **Deliver & record** — the email is sent via the configured `EmailProvider` (use `EMAIL_PROVIDER=mock` for local testing without SMTP), then the reported games are recorded to notification history.

### Running a local monitor

```bash
$env:EMAIL_PROVIDER = "mock"; npm run monitor
```

This collects games, analyzes them against the family profiles and wishlist, generates the HTML report, and captures it in the mock email provider (saved to `data/emails/` by default). Set `GAME_COLLECTOR=deku` to monitor real deals:

```bash
$env:GAME_COLLECTOR = "deku"; $env:EMAIL_PROVIDER = "mock"; npm run monitor
```

When no games are worth reporting and `sendEmptyDigest` is `false` (default), the email is **skipped** and a log line confirms it. For local testing, set `IGNORE_NOTIFICATION_HISTORY=true` to bypass cooldown filtering and keep the history file untouched:

```bash
$env:EMAIL_PROVIDER = "mock"; $env:IGNORE_NOTIFICATION_HISTORY = "true"; npm run monitor
```

To verify Gmail delivery without polluting notification history, set `FORCE_EMAIL=true`. It sends the digest even when there are 0 new notifications (cooldown filtering still applies) and never writes to history:

```bash
$env:EMAIL_PROVIDER = "gmail"; $env:FORCE_EMAIL = "true"; npm run monitor
```

For a rehearsal that runs the whole pipeline without touching the outside world, set `DRY_RUN=true`. It performs the full collection and analysis, generates the HTML digest/report, and prints what would be emailed, but it **sends no email** and **never writes to notification history**:

```bash
$env:EMAIL_PROVIDER = "mock"; $env:DRY_RUN = "true"; npm run monitor
```

`DRY_RUN` is independent of `IGNORE_NOTIFICATION_HISTORY` and `FORCE_EMAIL`. Combination behavior is: `FORCE_EMAIL` still applies its cooldown filtering and sends despite 0 notifications (unless `DRY_RUN` is also set, which suppresses delivery); `DRY_RUN` always suppresses email delivery and history writes, regardless of the other flags.

Every run ends with a compact summary of the decision, for example:

```
Monitor summary:
  Potential matches: 3
  New notifications: 0
  Skipped cooldown: 3
  Email: skipped (no new notifications)
```

or, with `FORCE_EMAIL=true`:

```
Monitor summary:
  Potential matches: 3
  New notifications: 0
  Skipped cooldown: 3
  Email: sent (FORCE_EMAIL=true)
```

or, with `DRY_RUN=true`:

```
Monitor summary:
  Potential matches: 3
  New notifications: 3
  Skipped cooldown: 0
  Email: not sent (DRY_RUN=true)
```

## Scheduled Execution (GitHub Actions)

The monitor runs automatically in the cloud via GitHub Actions (`.github/workflows/monitor.yml`), so there is no server to keep running:

- **Schedule** — runs once per day at 06:30 UTC via cron.
- **Manual dispatch** — trigger a run anytime from the **Actions** tab. Manual runs default to `EMAIL_PROVIDER=mock`, so you can validate the whole workflow end-to-end without any email credentials. A **Dry run** toggle (default off) runs the full pipeline but sends no email and writes no history.
- **Steps** — checks out the repo, sets up Node.js, installs dependencies with `npm ci`, then runs `npm run monitor`.
- **Logging** — the pipeline output shows the collector used, the number of games collected, how many were reported, and the completion status. In mock mode the rendered HTML email is also uploaded as a `monitor-emails` workflow artifact for inspection.

### Required secrets

Configure these under **Settings → Secrets and variables → Actions**. Secrets are never committed; leave unset the ones only needed for the gmail path when validating with mock mode.

| Secret             | Purpose                                        | Needed for                  |
| ------------------ | ---------------------------------------------- | --------------------------- |
| `EMAIL_PROVIDER`   | `gmail` or `mock`                              | scheduled gmail runs        |
| `SMTP_HOST`        | Gmail SMTP host                                | gmail mode                  |
| `SMTP_PORT`        | Gmail SMTP port                                | gmail mode                  |
| `SMTP_USER`        | Gmail address used for SMTP auth               | gmail mode                  |
| `SMTP_PASSWORD`    | Gmail App Password                             | gmail mode                  |
| `EMAIL_TO`         | Recipient address for notification emails      | gmail mode                  |
| `GAME_COLLECTOR`   | `deku` or `mock`                               | scheduled runs              |
| `DEALS_SOURCE_URL` | Deals JSON feed (optional, defaults to eShop)  | scheduled deku runs         |
| `MIN_DEAL_SCORE`   | Report threshold (optional, default `80`)      | scheduled runs              |
| `MAX_GAMES_PER_EMAIL` | Cap on games per email (optional)           | scheduled runs              |
| `NOTIFY_FREE_GAMES` | Report free games (optional)                 | scheduled runs              |
| `NOTIFY_WISHLIST_MATCHES` | Report wishlist matches (optional)      | scheduled runs              |
| `DEFAULT_WISHLIST_DISCOUNT_PERCENT` | Auto wishlist target discount % (optional) | scheduled runs  |
| `DEFAULT_NOTIFY_ON_ANY_DISCOUNT` | Default notify-on-any-discount (optional) | scheduled runs  |

Manual dispatch always lets you override `EMAIL_PROVIDER` and `GAME_COLLECTOR` per run, independent of the stored secrets.

## Notification History & Intelligence

To avoid spamming the family with the same deal, the pipeline tracks every game it has notified about and skips duplicates.

1. **History model** (`src/models/notification-history.ts`) — a `NotificationRecord` captures `gameId`, `title`, `notificationType` (`deal` / `free` / `wishlist`), `score`, `price`, and `notifiedAt`. A `NotificationHistory` is just `records[]`. Models carry no logic.
2. **Storage** (`src/config/notification-history-store.ts`) — `loadNotificationHistory()` / `saveNotificationHistory()` read and write `data/notification-history.json`. A missing file initializes an empty history, a malformed file fails with a clear error, and writes always produce valid JSON.
3. **Duplicate prevention** — before building the daily digest, the pipeline filters out games that were already notified for the **same price** within the cooldown window (`notificationCooldownDays` in `data/settings.json`, default `14`). If the price drops further, that counts as a new deal and is reported again.
4. **Recording** — after the email is delivered successfully, every game included in the digest is appended to the history file.

```
Reported games (threshold met)
    |
    v
Load history + apply cooldown filter (NOTIFICATION_COOLDOWN_DAYS)
    |
    v
Build DailyDigest  -->  render HTML  -->  send email
    |
    v
Record notified games back to history
```

### Validating history logic

```bash
npm run validate-history
```

Runs checks (no external services) that confirm: empty/missing history initializes correctly, save/load round-trips valid JSON, malformed files fail clearly, duplicate detection matches same game + price within cooldown, price changes reset the cooldown, expired records become notifiable again, and records carry the expected notification type.

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

- **Markdown report** — mirrors the daily digest section order (header, summary, wishlist alerts, best deals, free games, family recommendations, price watch, statistics), then appends a **Skipped Games** section split into cooldown and below-threshold groups.

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

### Validating configuration

```bash
npm run validate-config
```

This loads both files, prints a summary, and runs checks that confirm the JSON files exist, required fields are present and unique, optional fields are populated with runtime defaults, automatic target prices are calculated correctly, explicit target prices override automatic values, and malformed configuration fails with a clear error — with no SMTP credentials or external services required.

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

A missing settings file falls back to the defaults; a malformed file or invalid values fail with a clear error.

### Resolution priority

Environment variables override `settings.json`, which overrides built-in defaults:

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
| Collector               | `GAME_COLLECTOR`            | —                             | `mock`        |
| Deals per run           | `DEALS_LIMIT`               | —                             | `100`         |
| Deals source URL        | `DEALS_SOURCE_URL`          | —                             | eShop feed    |
| Deals currency          | `DEALS_CURRENCY`            | —                             | `EUR`         |

`dailyDigest` and `sendEmptyDigest` are configured **only** in `data/settings.json` (no environment variables); a missing or partial `dailyDigest` block merges with the defaults above.

### Validating settings

```bash
npm run validate-settings
```

Runs checks that confirm defaults apply when the file is missing, full and partial files load correctly (including partial `dailyDigest` blocks), malformed files and invalid values are rejected, and environment variables correctly override `settings.json`.

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
| `npm run validate-config` | Build and validate family profiles + wishlist config |
| `npm run validate-settings` | Build and validate notification preferences + env overrides |
| `npm run analyze-games`   | Build and analyze mock games vs profiles + wishlist |
| `npm run validate-collector` | Build and validate the game collector against real data |
| `npm run validate-history`   | Build and validate notification history + cooldown logic |
| `npm run monitor`       | Build and run the full monitor pipeline (collect → analyze → email) |
| `npm run validate-force-email` | Build and validate FORCE_EMAIL test-mode behavior (send empty digest, history untouched) |
| `npm run validate-dry-run` | Build and validate DRY_RUN test-mode behavior (full pipeline + HTML generated, no email sent, history untouched) |
| `npm run report`        | Build, run the pipeline with mock email, and write a markdown + HTML report |
| `npm run validate-reports` | Build and validate report generation (markdown + HTML) |

## Project Structure

```
├── docs/              # Roadmap and planning docs
├── src/
│   ├── collectors/    # Game data collection
│   │   ├── game-collector.ts
│   │   ├── mock-game-collector.ts
│   │   ├── deku-deals-collector.ts
│   │   ├── collector-factory.ts
│   │   ├── validate-collector.ts
│   │   └── collect-games.ts
│   ├── analyzer/      # Analysis: family/wishlist matching + deal scoring
│   │   ├── family-matcher.ts
│   │   ├── wishlist-matcher.ts
│   │   ├── deal-score.ts
│   │   └── analyze-games.ts
│   ├── notifications/ # Email system: digest builder, templates, renderer, providers
│   │   ├── daily-digest-builder.ts
│   │   ├── email-template.ts
│   │   ├── email-renderer.ts
│   │   ├── email-provider.ts
│   │   ├── email-factory.ts
│   │   ├── gmail-provider.ts
│   │   ├── mock-email-provider.ts
│   │   ├── email-validation.ts
│   │   └── test-email.ts
│   ├── config/        # Central config (app-config) + loaders + validators + history/settings
│   ├── pipeline/      # End-to-end monitor run (collect → analyze → email)
│   ├── reports/       # Monitoring report generation (markdown + HTML)
│   ├── models/        # Shared domain types (Game, GameDeal, NotificationSettings, ...)
│   └── main.ts        # Service entry point
├── data/              # Runtime data / cache + family/wishlist config + history + settings
│   ├── family-profile.json
│   ├── wishlist.json
│   ├── notification-history.json
│   └── settings.json
├── reports/           # Generated monitoring reports (markdown + html/, git-ignored)
└── .github/workflows  # Scheduled execution (GitHub Actions monitor workflow)
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full milestone plan.
