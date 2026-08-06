# Production Readiness

This guide walks through running Nintendo Switch Games Monitor for real daily use — locally first, then scheduled in GitHub Actions. Configuration splits across four layers, and each value lives in exactly one place:

```
.env                 secrets only (SMTP_USER, SMTP_PASSWORD, optional NODE_ENV)
data/settings.json   user preferences + notification settings
provider/collector   provider-specific defaults (Gmail SMTP host/port, catalog path, …)
command line / CI    one-time execution modes (--dry-run / --force-email)
```

## Local Configuration

The monitor reads user preferences from `data/settings.json` and secrets from a `.env` file in the project root (loaded via `dotenv`). Copy the template and fill in your values:

```bash
cp .env.example .env
```

`.env` is git-ignored — secrets never get committed.

### User preferences — `data/settings.json`

Non-secret application behavior is configured in `data/settings.json`, not `.env`:

```json
{
  "platform": "switch1",
  "emailProvider": "gmail",
  "gameCollector": "nintendo",
  "logLevel": "info"
}
```

- `platform` — console to filter the catalog for (`switch1`, `switch2`, `both`).
- `emailProvider` — `gmail` for real delivery or `mock` for local capture.
- `gameCollector` — `nintendo` for real US Switch deals or `mock` for sample data.
- `logLevel` — `debug` | `info` | `warn` | `error` | `silent`.
- `emailTo` — optional digest recipient; when omitted the digest is sent **to the sender** (`SMTP_USER`).

Precedence is **environment variable > `data/settings.json` > defaults**, so a one-off run can still override preferences for CI or a temporary run (`NINTENDO_PLATFORM`, `EMAIL_PROVIDER`, `GAME_COLLECTOR`, `LOG_LEVEL`). The digest recipient is **not** overridable via an environment variable — it comes only from `emailTo` in settings (falling back to `SMTP_USER`). Dry-run / force-email are **not** settings and have no environment variables — they are one-time command-line flags (see [Execution modes](#execution-modes)).

### Required local secrets

`.env` keeps secrets only:

| Variable | Purpose | Example |
| -------- | ------- | ------- |
| `SMTP_USER` | Gmail address used for SMTP auth **and as the From address** | `SMTP_USER=your-email@gmail.com` |
| `SMTP_PASSWORD` | Gmail **App Password** (see below) | `SMTP_PASSWORD=xxxx xxxx xxxx xxxx` |
| `NODE_ENV` | Optional; e.g. `development` | `NODE_ENV=development` |

There is no `MAIL_FROM` — the sender is always `SMTP_USER` (single source of truth). The Gmail SMTP host/port are built into the provider (`smtp.gmail.com:465`, implicit TLS) and are not configurable. Other environment variables are optional one-off overrides and are kept **out of** `.env` unless you have a temporary reason to set one.

## Gmail Production Setup

For real daily delivery use Gmail SMTP:

- Set `emailProvider=gmail` in `data/settings.json`.
- Set `SMTP_USER` to the sending Gmail address.
- Optionally set `emailTo` in `data/settings.json` for the recipient (defaults to `SMTP_USER`).
- Set `SMTP_PASSWORD` to a Gmail **App Password**.

### App Password requirement

Gmail **does not accept your regular account password** for SMTP. You must generate an App Password:

1. Enable **2-Step Verification** on the Google account (required for App Passwords).
2. Go to **Google Account → Security → 2-Step Verification → App passwords**.
3. Create an app password for "Mail" on "Other (custom name)".
4. Paste the 16-character App Password (spaces are fine) into `SMTP_PASSWORD`.

Keep the App Password only in `.env` (local) or GitHub secrets (CI). Never commit it.

## Collector Setup

For real Nintendo Switch deals, set `gameCollector=nintendo` in `data/settings.json` (`GAME_COLLECTOR=nintendo` overrides it for a one-off run). The collector targets the **US** eShop (`NINTENDO_REGION=US`): prices in **USD**, US (ESRB) ratings and genres from the local game catalog, and deal links to `nintendo.com/us/store/products/<slug>/` (the `slug` is taken verbatim from the catalog entry, so every deal link is canonical and resolvable). Before querying prices it filters the catalog to the configured console (`platform` in `data/settings.json` — `switch1` / `switch2` / `both`, default `switch1`; `NINTENDO_PLATFORM` overrides it). It watches the games listed in `data/game-catalog.json` (currently 300) and queries Nintendo's official price API (`api.ec.nintendo.com/v1/price`) in batches to detect current sales; games that are not discounted are ignored. Point `GAME_CATALOG` at another file to watch a different set of games. Use `gameCollector=mock` for offline sample data.

To refresh the catalog, run `npm run refresh-catalog` — it regenerates `data/game-catalog.json` from the store sitemap and product pages into a temporary file, diffs it against the committed catalog by `nsuid`, and prints a concise change summary (added / removed / updated games) **without overwriting the file**. Review the summary, then apply it with `npm run refresh-catalog -- --apply` (or `CATALOG_APPLY=true`) to write the generated catalog back. Applied catalogs are re-validated (no duplicate nsuids/slugs, required fields present, valid platforms, well-formed URLs) before being written. For a raw regeneration that skips the diff, use `npm run generate-catalog` (targeting 300 entries by default; `CATALOG_TARGET` / `CATALOG_OUT` override). Run `npm run validate-collector` and `npm run validate-refresh` to confirm the catalog passes structural validation and that the diff/refresh behavior is correct.

### Historical price tracking

`data/notification-history.json` also records a per-game **price history** so deal reports can provide price context. Each deal-history entry carries an optional `priceHistory` — an ordered list of `{ date, price }` observations. Only meaningful changes are stored (first time a game is seen on sale, a sale price change, or a sale restarting at a different price); identical unchanged prices are never appended, keeping the file bounded. Existing files without `priceHistory` load as-is, and legacy `{ records: [...] }` files migrate into entries while seeding a price history from the recorded notification prices (no data loss).

The digest surfaces this context only when it is useful: **⭐ Lowest price seen** (with the previous low) when the current price is the best ever, or **Lowest seen: $X** when a cheaper historical price exists — otherwise no extra line is shown.

The same history also powers a one-glance **deal quality** rating on deal cards. `evaluateDealQuality` (in `src/history/deal-quality.ts`) maps the current price against the historical low and average to `excellent` (new lowest), `great` (within ~10% of the low), `good` (below the historical average), or `weak` (at/above the average), each with a short reason. Games with no useful history get no badge. When both are present, the rating badge takes precedence over the quieter price-context line.

Run `npm run validate-price-intelligence` to confirm observation recording, duplicate suppression, price-change detection, lowest/highest/average math, empty-history safety, migration, and digest rendering; run `npm run validate-deal-quality` to confirm the rating rules, threshold math, empty-history safety, and badge rendering. `npm test` aggregates both suites.

### Hiding games from the digest (blacklist)

Some titles are never worth showing — shovelware, inappropriate games, or anything the family just is not interested in. Add their exact titles to `data/blacklist.json`. Each entry is a title string or an object with a `title` and an optional `reason`:

```json
{
  "games": [
    "Carrot Smash",
    "LEGO",
    { "title": "Example Game", "reason": "Not family-friendly" }
  ]
}
```

Matching is **case-insensitive** on the normalized title (trimmed + lowercased) and uses **whole-word boundaries**, so an entry also blocks its franchise: `"LEGO"` hides `LEGO Jurassic World`, `LEGO Star Wars: The Skywalker Saga`, and the exact title `LEGO`, but it never matches a substring inside another word (e.g. `lego` inside `Allegory Quest`). The filter runs **after collection and before analysis**: blacklisted games are excluded from deal analysis, **Best Deals**, **Recommended For Your Family**, and notifications, and they do not change the **Games Checked** statistic. The digest builder re-applies the blacklist while assembling **every** section (including **Still On Sale** and Today's Summary counts), so a blacklisted game can never appear anywhere in the digest outside **Wishlist Watch**. If you put a blacklisted game on the wishlist it stays visible in **Wishlist Watch** with today's price/status, but it is still never recommended or shown as a general deal. The collector and the price API are untouched — hiding is purely a display-side filter. Run `npm run validate-blacklist` to confirm the behavior.

### Digest readability

Long **Best Deals** and **Still On Sale** lists automatically switch to a responsive **two-column** layout when a section holds more than 6 items, so long lists are easier to scan; shorter lists, **Wishlist Watch**, and the Markdown report stay single-column. **Recommended For Your Family** is grouped **by game**: each game appears once with every matching family member listed beneath it (and their reason), collapsing to a single **👨‍👩‍👧‍👦 Entire family** label when the whole family matches. Recommendations are ordered by usefulness (wishlist games, then whole-family matches, then the most matching members, then highest deal score) and capped at `dailyDigest.recommendedFamilyGamesLimit` (default `10`). Run `npm run validate-recommendations` and `npm run validate-email` to confirm.

## Execution modes

Dry-run and force-email are **one-time per run** — they are never persisted in `.env` or `data/settings.json`, so a normal `npm run monitor` afterwards behaves normally again:

- `npm run monitor -- --dry-run` (same as `npm run monitor:dry`) — runs the full pipeline (collect → analyze → generate HTML digest/report) but **sends no email** and **never writes to notification history**. Safe to run any time.
- `npm run monitor -- --force-email` (same as `npm run monitor:test-email`) — sends the digest even when there are 0 new notifications (cooldown filtering still applies) and **never writes to history**. Used to verify Gmail delivery without polluting history.
- For fully offline testing set `emailProvider=mock` in `data/settings.json` (or pass `EMAIL_PROVIDER=mock` for one run): the digest is captured locally instead of emailed.

## GitHub Actions

The monitor runs automatically via `.github/workflows/monitor.yml` — no server to maintain.

### Scheduled execution

A cron schedule runs the pipeline once per day (06:30 UTC) using **production configuration**: `gameCollector=nintendo`, `emailProvider=gmail`, and `platform=switch1` come from the committed `data/settings.json`, with the `SMTP_USER` / `SMTP_PASSWORD` secrets injected from GitHub. The workflow also sets `EMAIL_PROVIDER` / `GAME_COLLECTOR` / `NINTENDO_PLATFORM` as run-scoped environment overrides so a manual run can switch them without editing files. Each morning it collects the Nintendo catalog and emails the daily digest whenever there are new notifications. Cooldown filtering and the persistent deal history behave exactly as they do locally: every real run records the games that are on sale, refreshes when they were last seen, tracks how long a deal stays active, and never spams the same game+price inside the cooldown window. Any failing step fails the run and the error is visible in the GitHub Actions logs for that run.

Repository secrets used by the scheduled run:

- Gmail secrets: `SMTP_USER`, `SMTP_PASSWORD` (the From address is `SMTP_USER`; the recipient is `emailTo` from settings, defaulting to `SMTP_USER`).
- Optional overrides (tuning values you can adjust without editing the repo): `GAME_CATALOG`, `NINTENDO_PLATFORM`, `DEALS_CURRENCY`, `MIN_DEAL_SCORE`, `MAX_GAMES_PER_EMAIL`, `NOTIFY_FREE_GAMES`, `NOTIFY_WISHLIST_MATCHES`, `DEFAULT_WISHLIST_DISCOUNT_PERCENT`, `DEFAULT_NOTIFY_ON_ANY_DISCOUNT`.

Configure them under **Settings → Secrets and variables → Actions**. Do **not** add `SMTP_HOST`, `SMTP_PORT`, or `EMAIL_TO` — host/port are built into the provider and the recipient comes from `emailTo` in `data/settings.json` (falling back to `SMTP_USER`), never from an environment variable.

### Manual execution

Trigger a run anytime from the **Actions** tab — either to test the workflow before trusting the schedule, or to force a run out-of-band. Manual dispatch lets you pick per run:

- **Email provider** — `mock` (default, no credentials needed) or `gmail`.
- **Game collector** — `nintendo` (default) or `mock`.
- **Dry run** — boolean toggle (default off): passes `--dry-run`.
- **Force email** — boolean toggle (default off): passes `--force-email`.

Because manual runs default to `mock` / `nintendo` / both toggles off, they are safe to run without exposing any email credentials until you explicitly enable them.

## First Production Validation Checklist

Run through these before trusting the scheduled job:

1. **Configuration validation passes** — `npm run validate-config`, `npm run validate-settings`, `npm run validate-preferences`, and `npm run validate-production` (workflow config, production settings, scheduled-mode behavior).
2. **Dry run succeeds** — `npm run monitor:dry` completes the full pipeline, prints the summary with `Email: not sent (DRY_RUN=true)`, and leaves `data/notification-history.json` untouched.
3. **Live Gmail test succeeds** — `npm run monitor:test-email` (with `emailProvider=gmail` and the `SMTP_USER` / `SMTP_PASSWORD` secrets set) sends a real digest to the recipient inbox.
4. **Notification history behaves correctly** — a normal `npm run monitor` records notified games into `data/notification-history.json` (as deal-history entries); re-running does not notify the same game+price within the cooldown window and does not duplicate entries, and `npm run validate-history` passes.
5. **Scheduled workflow verified** — trigger the workflow manually with `EMAIL_PROVIDER=gmail` and `GAME_COLLECTOR=nintendo`, confirm the run succeeds and the email arrives, then confirm the daily cron is enabled.
6. **Catalog refresh workflow verified** — run `npm run refresh-catalog`, confirm it prints the change summary (added / removed / updated) without modifying `data/game-catalog.json`, then review and apply with `npm run refresh-catalog -- --apply`. This is the trusted maintenance path for keeping the monitored catalog current.
7. **Price history verified** — confirm `npm run validate-price-intelligence` and `npm run validate-deal-quality` pass and that a real run writes a bounded `priceHistory` (no per-game daily duplicates) into `data/notification-history.json`; verify the digest shows **Lowest price seen** / **Lowest seen: $X** and the deal-quality badge only where useful.
8. **Blacklist verified in the live digest** — add an unwanted title to `data/blacklist.json` and confirm it appears **only** in **Wishlist Watch** (when it is on the wishlist) and nowhere else — not in Today's Summary, Best Deals, Still On Sale, or recommendations. Run `npm run validate-blacklist` to confirm the digest-level filtering.
9. **Digest UX verified** — run `npm run monitor:dry` and confirm long **Best Deals** / **Still On Sale** lists render two-column, that **Recommended For Your Family** groups by game (showing the **👨‍👩‍👧‍👦 Entire family** label only when the whole family matches), and that the section respects `dailyDigest.recommendedFamilyGamesLimit`. `npm run validate-recommendations` and `npm run validate-email` cover these.
