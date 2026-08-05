# Production Readiness

This guide walks through running Nintendo Switch Games Monitor for real daily use — locally first, then scheduled in GitHub Actions. It assumes you are using the existing configuration flow (`.env` locally, repository secrets/environment in CI). There is no second configuration system.

## Local Configuration

The monitor reads its configuration from a `.env` file in the project root (loaded via `dotenv`). Copy the template and fill in your values:

```bash
cp .env.example .env
```

`.env` is git-ignored — secrets never get committed.

### Required local variables

| Variable | Purpose | Example |
| -------- | ------- | ------- |
| `EMAIL_PROVIDER` | `gmail` for real delivery, `mock` for local testing | `EMAIL_PROVIDER=gmail` |
| `SMTP_USER` | Gmail address used for SMTP auth (and the `From` address) | `SMTP_USER=your-email@gmail.com` |
| `SMTP_PASSWORD` | Gmail **App Password** (see below) | `SMTP_PASSWORD=xxxx xxxx xxxx xxxx` |
| `EMAIL_TO` | Recipient of the daily digest | `EMAIL_TO=your-email@gmail.com` |
| `GAME_COLLECTOR` | `nintendo` for real US Switch deals, `mock` for sample data | `GAME_COLLECTOR=nintendo` |

Other variables are optional (see `.env.example`): `SMTP_HOST`, `SMTP_PORT`, `GAME_CATALOG`, `NINTENDO_PLATFORM`, `DEALS_CURRENCY`, `DEALS_LIMIT`, `MIN_DEAL_SCORE`, `NOTIFICATION_COOLDOWN_DAYS`, `MAX_GAMES_PER_EMAIL`, `NOTIFY_FREE_GAMES`, `NOTIFY_WISHLIST_MATCHES`, `DEFAULT_WISHLIST_DISCOUNT_PERCENT`, `DEFAULT_NOTIFY_ON_ANY_DISCOUNT`, `IGNORE_NOTIFICATION_HISTORY`, `FORCE_EMAIL`, `DRY_RUN`.

## Gmail Production Setup

For real daily delivery use Gmail SMTP:

- Set `EMAIL_PROVIDER=gmail`.
- Set `SMTP_USER` to the sending Gmail address.
- Set `EMAIL_TO` to the recipient.
- Set `SMTP_PASSWORD` to a Gmail **App Password**.

### App Password requirement

Gmail **does not accept your regular account password** for SMTP. You must generate an App Password:

1. Enable **2-Step Verification** on the Google account (required for App Passwords).
2. Go to **Google Account → Security → 2-Step Verification → App passwords**.
3. Create an app password for "Mail" on "Other (custom name)".
4. Paste the 16-character App Password (spaces are fine) into `SMTP_PASSWORD`.

Keep the App Password only in `.env` (local) or GitHub secrets (CI). Never commit it.

## Collector Setup

For real Nintendo Switch deals, set `GAME_COLLECTOR=nintendo`. The collector targets the **US** eShop (`NINTENDO_REGION=US`): prices in **USD**, US (ESRB) ratings and genres from the local game catalog, and deal links to `nintendo.com/us/store/products/<slug>/` (the `slug` is taken verbatim from the catalog entry, so every deal link is canonical and resolvable). Before querying prices it filters the catalog to the configured console (`NINTENDO_PLATFORM=switch1` / `switch2` / `both`; default `switch1`). It watches the games listed in `data/game-catalog.json` and queries Nintendo's official price API (`api.ec.nintendo.com/v1/price`) to detect current sales; games that are not discounted are ignored. Point `GAME_CATALOG` at another file to watch a different set of games. Use `GAME_COLLECTOR=mock` for offline sample data.

## GitHub Actions

The monitor runs automatically via `.github/workflows/monitor.yml` — no server to maintain.

### Scheduled execution

A cron schedule runs the pipeline once per day (06:30 UTC) using **production configuration**: `GAME_COLLECTOR=nintendo`, `EMAIL_PROVIDER=gmail`, `NINTENDO_PLATFORM=switch1`, and `DRY_RUN=false`. Each morning it collects the Nintendo catalog and emails the daily digest whenever there are new notifications. Cooldown filtering and the persistent deal history behave exactly as they do locally: every real run records the games that are on sale, refreshes when they were last seen, tracks how long a deal stays active, and never spams the same game+price inside the cooldown window. Any failing step fails the run and the error is visible in the GitHub Actions logs for that run.

Repository secrets used by the scheduled run:

- `EMAIL_PROVIDER` / `GAME_COLLECTOR` default to `gmail` / `nintendo` in production; `NINTENDO_PLATFORM` defaults to `switch1`.
- Gmail secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_TO`.
- Optional overrides: `GAME_CATALOG`, `NINTENDO_PLATFORM`, `DEALS_CURRENCY`, `MIN_DEAL_SCORE`, `MAX_GAMES_PER_EMAIL`, `NOTIFY_FREE_GAMES`, `NOTIFY_WISHLIST_MATCHES`, `DEFAULT_WISHLIST_DISCOUNT_PERCENT`, `DEFAULT_NOTIFY_ON_ANY_DISCOUNT`.

Configure them under **Settings → Secrets and variables → Actions**.

### Manual execution

Trigger a run anytime from the **Actions** tab — either to test the workflow before trusting the schedule, or to force a run out-of-band. Manual dispatch lets you pick per run:

- **Email provider** — `mock` (default, no credentials needed) or `gmail`.
- **Game collector** — `nintendo` (default) or `mock`.
- **Dry run** — boolean toggle (default off).

Because manual runs default to `mock` / `nintendo` / dry-run-off, they are safe to run without exposing any email credentials until you explicitly enable them.

### DRY_RUN option

Turning on **Dry run** in manual dispatch sets `DRY_RUN=true`: the full pipeline runs (collect → analyze → generate HTML digest/report) but **no email is sent** and **notification history is not written**. Safe to run any time.

### FORCE_EMAIL option

`FORCE_EMAIL=true` sends the digest even when there are 0 new notifications (cooldown filtering still applies) and never writes to history. It is used to verify Gmail delivery without polluting notification history. It can be provided as a repository secret or set manually.

## First Production Validation Checklist

Run through these before trusting the scheduled job:

1. **Configuration validation passes** — `npm run validate-config`, `npm run validate-settings`, and `npm run validate-production` (workflow config, production settings, scheduled-mode behavior).
2. **DRY_RUN run succeeds** — `npm run monitor:dry` completes the full pipeline, prints the summary with `Email: not sent (DRY_RUN=true)`, and leaves `data/notification-history.json` untouched.
3. **Live Gmail test succeeds** — `npm run monitor:test-email` with `EMAIL_PROVIDER=gmail` sends a real digest to the recipient inbox.
4. **Notification history behaves correctly** — a normal `npm run monitor` records notified games into `data/notification-history.json` (as deal-history entries); re-running does not notify the same game+price within the cooldown window and does not duplicate entries, and `npm run validate-history` passes.
5. **Scheduled workflow verified** — trigger the workflow manually with `EMAIL_PROVIDER=gmail` and `GAME_COLLECTOR=nintendo`, confirm the run succeeds and the email arrives, then confirm the daily cron is enabled.
