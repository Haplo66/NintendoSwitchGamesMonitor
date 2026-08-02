# Nintendo Switch Games Monitor

A free-only service that watches Nintendo Switch game deals, analyzes discount opportunities, and notifies the family via HTML email when something worth buying shows up.

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

1. **Models** (`src/models/`) — generic domain types such as `GameDeal`, `FreeGame`, and `NotificationReport`. They hold no presentation logic, so collectors and analyzers can feed them later without touching the email code.
2. **Template** (`src/notifications/email-template.ts`) — pure builder functions that turn model data into HTML blocks (header, deal cards, free-game cards, summary). All styling is inline CSS because email clients strip `<style>` blocks and external stylesheets.
3. **Renderer** (`src/notifications/email-renderer.ts`) — composes the blocks into a complete HTML email document (`renderNotificationEmail(report)`).
4. **Provider abstraction** (`src/notifications/email-provider.ts`) — a single `EmailProvider` interface (`sendEmail({ subject, html })`) so Gmail can be swapped for another provider later without changing callers.
5. **Gmail provider** (`src/notifications/gmail-provider.ts`) — a concrete SMTP implementation built on nodemailer, configured entirely from environment variables.
6. **Mock provider** (`src/notifications/mock-email-provider.ts`) — a test double that implements the same interface but never sends a real email. It captures the message in memory (and optionally writes the rendered HTML to disk) for verification.
7. **Provider factory** (`src/notifications/email-factory.ts`) — `createEmailProvider()` selects the active provider from the `EMAIL_PROVIDER` environment variable (`gmail` or `mock`). No caller knows which concrete provider it gets, and the renderer never does.

```
EmailProvider
    |
    +-- GmailProvider   (real SMTP delivery)
    |
    +-- MockEmailProvider (local testing / CI validation)
```

### Testing without SMTP credentials

Set `EMAIL_PROVIDER=mock` (or in `.env`) and run:

```bash
npm run validate-email
```

This runs a self-contained validation suite with no external services:

- verifies HTML output is generated (doctype, full document)
- verifies HTML escaping protects against injected markup
- verifies the discounted games section (prices, discount, age rating, reasons)
- verifies the free games section
- verifies buttons and links are present
- verifies an email can be captured by `MockEmailProvider`

It always succeeds without any SMTP credentials, making it safe for local runs and future GitHub Actions validation. The mock provider also writes the rendered email to `data/emails/` (default) so you can open it in a browser.

### Sending a test email

```bash
npm run test-email
```

This builds the project, generates a sample `NotificationReport`, renders it to HTML, and sends it. With `EMAIL_PROVIDER=gmail` (default) it sends a real email via Gmail SMTP; with `EMAIL_PROVIDER=mock` it captures the message locally instead — handy for previewing without touching a real inbox.

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
Notification Report (HTML)
    |
    v
HTML Email (provider)
```

1. **Collect** — runs the selected `GameCollector` (`mock` or `deku`).
2. **Analyze** — family matcher, wishlist matcher, and deal scorer produce a `GameAnalysis` per game.
3. **Filter** — only games worth reporting are kept. A game is included when it is free (if `notifyFreeGames`), matches a wishlist item (if `notifyWishlistMatches`), or its deal score reaches `minimumDealScore`.
4. **Cooldown** — games already notified for the same price within `notificationCooldownDays` are skipped, and the report is capped at `maxGamesPerEmail` games (best-scoring first).
5. **Render** — filtered games are converted into a `NotificationReport` (with run statistics) and rendered to an HTML email.
6. **Deliver & record** — the email is sent via the configured `EmailProvider` (use `EMAIL_PROVIDER=mock` for local testing without SMTP), then the reported games are recorded to notification history.

### Running a local monitor

```bash
$env:EMAIL_PROVIDER = "mock"; npm run monitor
```

This collects games, analyzes them against the family profiles and wishlist, generates the HTML report, and captures it in the mock email provider (saved to `data/emails/` by default). Set `GAME_COLLECTOR=deku` to monitor real deals:

```bash
$env:GAME_COLLECTOR = "deku"; $env:EMAIL_PROVIDER = "mock"; npm run monitor
```

## Scheduled Execution (GitHub Actions)

The monitor runs automatically in the cloud via GitHub Actions (`.github/workflows/monitor.yml`), so there is no server to keep running:

- **Schedule** — runs once per day at 06:30 UTC via cron.
- **Manual dispatch** — trigger a run anytime from the **Actions** tab. Manual runs default to `EMAIL_PROVIDER=mock`, so you can validate the whole workflow end-to-end without any email credentials.
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

Manual dispatch always lets you override `EMAIL_PROVIDER` and `GAME_COLLECTOR` per run, independent of the stored secrets.

## Notification History & Intelligence

To avoid spamming the family with the same deal, the pipeline tracks every game it has notified about and skips duplicates.

1. **History model** (`src/models/notification-history.ts`) — a `NotificationRecord` captures `gameId`, `title`, `notificationType` (`deal` / `free` / `wishlist`), `score`, `price`, and `notifiedAt`. A `NotificationHistory` is just `records[]`. Models carry no logic.
2. **Storage** (`src/config/notification-history-store.ts`) — `loadNotificationHistory()` / `saveNotificationHistory()` read and write `data/notification-history.json`. A missing file initializes an empty history, a malformed file fails with a clear error, and writes always produce valid JSON.
3. **Duplicate prevention** — before building the notification report, the pipeline filters out games that were already notified for the **same price** within the cooldown window (`notificationCooldownDays` in `data/settings.json`, default `14`). If the price drops further, that counts as a new deal and is reported again.
4. **Recording** — after the email is delivered successfully, every game included in the notification is appended to the history file.

```
Reported games (threshold met)
    |
    v
Load history + apply cooldown filter (NOTIFICATION_COOLDOWN_DAYS)
    |
    v
Build NotificationReport  -->  render HTML  -->  send email
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

- **Markdown report** — header (app name, timestamp, collector), summary table (games collected / analyzed / reported / skipped by cooldown), **Top Opportunities** (price, discount, score, reasons, wishlist and family matches per game), and a **Skipped** section split into low-score and cooldown groups.
- **HTML report** — reuses the email rendering (header, deal/free cards, summary) so it is readable in a browser, plus a skipped-games section.

Files are never overwritten: if a name collision occurs, a numeric suffix (`-2`, `-3`, …) is added. Reports are git-ignored runtime artifacts.

### Validating report generation

```bash
npm run validate-reports
```

Runs checks (no external services) that confirm the markdown and HTML reports are generated, reported games and their details are included, skipped games are listed, empty results are handled gracefully, and report files are written without overwriting.

## Family Profiles & Wishlist

The service is family-aware: games are matched against who lives in the household and what they want.

### Family profiles

`data/family-profile.json` holds one entry per family member. Each profile captures:

- `name` — who the profile belongs to (e.g., a kid or teen)
- `maxAge` — optional age limit used as the foundation for age filtering
- `preferredGenres` — genres to prioritize
- `excludedGenres` — genres to keep away from this member
- `notes` — optional free-form notes

### Wishlist

`data/wishlist.json` lists the games the family wants to watch. Each item captures:

- `gameTitle` — the game to monitor
- `targetPrice` — optional price at which it is worth buying
- `notifyOnAnyDiscount` — flag to alert on any discount, even if the target price is not reached
- `notes` — optional free-form notes

The wishlist is designed to be matched against collected games later: once a collected game's title matches a wishlist item and its price is at or below the target price (or any discount applies), it becomes a notification candidate.

### Validating configuration

```bash
npm run validate-config
```

This loads both files, prints a summary, and runs checks that confirm the JSON files exist, required fields are present, and malformed configuration fails with a clear error — with no SMTP credentials or external services required.

## Analysis & Deal Intelligence

The analysis layer evaluates collected games against the family profiles and the wishlist, producing match information and a deal score — no notifications yet.

1. **Family matcher** (`src/analyzer/family-matcher.ts`) — checks a game against a family profile: age compatibility (ESRB rating vs `maxAge`), excluded genres (block), and preferred genres (positive reason). Returns `FamilyMatchResult[]` (`profileName`, `matched`, `reasons`).
2. **Wishlist matcher** (`src/analyzer/wishlist-matcher.ts`) — compares collected games to wishlist items by title and evaluates the price target. Returns `WishlistMatchResult | null` (`matched`, `wishlistItem`, `priceTargetReached`).
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
  "notifyWishlistMatches": true
}
```

- `minimumDealScore` — minimum deal score for a game to be included in the report.
- `notificationCooldownDays` — days before the same game at the same price is notified again.
- `maxGamesPerEmail` — cap on games per email (best-scoring first when over the cap).
- `notifyFreeGames` — whether "free" alone is enough to report a game.
- `notifyWishlistMatches` — whether a wishlist match alone is enough to report a game.

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
| Collector               | `GAME_COLLECTOR`            | —                             | `mock`        |
| Deals per run           | `DEALS_LIMIT`               | —                             | `100`         |
| Deals source URL        | `DEALS_SOURCE_URL`          | —                             | eShop feed    |
| Deals currency          | `DEALS_CURRENCY`            | —                             | `EUR`         |

### Validating settings

```bash
npm run validate-settings
```

Runs checks that confirm defaults apply when the file is missing, full and partial files load correctly, malformed files and invalid values are rejected, and environment variables correctly override `settings.json`.

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
│   ├── notifications/ # Email system: templates, renderer, providers
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
