# Roadmap

## v0.1 Foundation
- Project setup
- TypeScript configuration
- Environment configuration

> **Status: ✅ Complete**

## v0.2 Email Notification System
- HTML email templates
- Gmail SMTP integration

> **Status: ✅ Complete**

## v0.3 Game Data Collection
- Collect Nintendo Switch game information

> **Status: 🔄 In progress**

## v0.4 Family Profiles & Wishlist

Features:
- Child/family profiles
- Age filtering foundation
- Preferred genres
- Desired games list
- Target price alerts foundation

> **Status: 🔄 In progress**

## v0.5 Deal Intelligence

Features:
- Family matching
- Wishlist matching
- Deal scoring foundation

> **Status: 🔄 In progress**

## v0.6 Real Game Data Collector
- Connect a real Switch game deals source
- Collector selection (mock / real)
- Error handling and validation

> **Status: 🔄 In progress**

## v0.7 End-to-End Monitoring Pipeline

Features:
- Full collection flow
- Analysis integration
- HTML report generation

> **Status: 🔄 In progress**

## v0.8 Scheduled Cloud Execution

Features:
- Daily GitHub Actions run
- Secret configuration
- Automated monitoring

> **Status: 🔄 In progress**

## v0.9 Notification Intelligence

Features:
- Duplicate prevention
- Notification history
- Cooldown handling

> **Status: 🔄 In progress**

## v0.10 Configuration & User Preferences

Features:
- Central settings
- Better customization
- Improved summaries

> **Status: 🔄 In progress**

## v0.11 Monitoring Reports

Features:
- Markdown reports
- HTML reports
- Historical run visibility

> **Status: ✅ Complete**

## v0.11.1 Simplified Configuration & Auto-Populated Defaults

Features:
- Removed user-maintained IDs (family profiles keyed by `name`, wishlist keyed by `gameTitle`)
- Minimal configuration with runtime defaults for optional fields
- Global defaults for automatic wishlist target prices (`defaultWishlistDiscountPercent`, `defaultNotifyOnAnyDiscount`)
- Automatic wishlist target price calculation (`originalPrice × (1 − discount%)`, runtime only)
- Reports show configured vs auto target prices
- Extended config/settings validation and updated docs

> **Status: ✅ Complete**

## v0.12 Daily Digest Experience

Features:
- Notification email redesigned as a parent-friendly **Nintendo Switch Daily Digest**
- Digest sections: header, Today's Summary, Wishlist Alerts, Best Deals, Free Games, Recommended For Your Family, Price Watch, Monitoring Statistics, footer
- Empty sections disappear; subject line summarizes the day (`N game(s) worth checking`)
- `dailyDigest` settings (`maxBestDeals`, `maxWishlistAlerts`, `showStatistics`, `showPriceWatch`) in `data/settings.json`
- Markdown and HTML reports aligned to the digest section order
- Extended email/report validation covering every digest section
- Updated README (digest layout, settings)

> **Status: 🔄 In progress**

## v0.13 Digest Sending Rules

Features:
- `sendEmptyDigest` setting (default `false`) — empty digests are skipped and logged instead of emailed
- Clearer summary metrics: **Potential matches**, **New notifications**, **Skipped by cooldown** (replacing "Deals found")
- Test mode via `IGNORE_NOTIFICATION_HISTORY=true` — bypasses cooldown filtering and never writes to history
- Extended email/settings validation and updated docs

> **Status: 🔄 In progress**

## v0.14 Email Test Mode

Features:
- `FORCE_EMAIL=true` test mode — sends the digest even with 0 new notifications, keeps cooldown filtering, never writes to history
- Compact monitor summary printed each run (Potential matches / New notifications / Skipped cooldown / Email outcome)
- Normal scheduled behavior unchanged (only useful digests are sent, no spam)
- New `validate-force-email` validation covering FORCE_EMAIL behavior
- Updated docs (.env.example, README)

> **Status: 🔄 In progress**

## v0.15 Dry Run Mode

Features:
- `DRY_RUN=true` test mode — runs the full pipeline (collect, analyze, generate the HTML digest/report) but sends **no email** and **never writes to notification history**
- Startup logging prints collector, email provider, minimum score, cooldown, and test-mode status (including DRY_RUN)
- Production configuration defaults: `GAME_COLLECTOR=deku`, `EMAIL_PROVIDER=gmail`; GitHub Actions `dry_run` manual-dispatch toggle
- New `validate-dry-run` validation covering full pipeline execution, HTML generation, email suppression, and unchanged history
- Updated docs (.env.example, README)

> **Status: 🔄 In progress**

## v0.16 Production Readiness & Local Runner

Features:
- `docs/PRODUCTION.md` — local configuration, Gmail App Password setup, deku collector, GitHub Actions (scheduled/manual/DRY_RUN/FORCE_EMAIL), and first-production validation checklist
- Local runner `scripts/run-monitor.ts` — convenience wrapper that reuses the existing monitor pipeline (no duplicated logic)
- Package scripts: `npm run monitor:dry` (sets `DRY_RUN=true`) and `npm run monitor:test-email` (sets `FORCE_EMAIL=true`)
- README "Running Locally" section explaining normal / dry-run / test-email modes
- GitHub Actions behavior unchanged

> **Status: ✅ In progress**

## v0.17 US eShop Collector (predecessor)

Features (later replaced by v0.18):
- Real collector defaults to **US** eShop (`NINTENDO_REGION=US`): USD prices, US (ESRB) ratings, deal links to `nintendo.com/us/store/products/…`
- `NINTENDO_REGION` config supporting `US` (default) and `EU` (Europe feed, EUR/PEGI)
- Region drives the default deals feed, currency, and deal URL host; `DEALS_SOURCE_URL` / `DEALS_CURRENCY` still override per-region
- Collector validation extended with offline region checks (US loads USD/ESRB/US URLs, EU preserves EUR/PEGI/Europe URLs)
- Validation scripts pinned to the mock collector for deterministic offline runs

> **Status: ✅ Superseded**

## v0.18 US Collector Replaced with Nintendo Price API

Features:
- `NintendoPriceCollector` replaces the deku collector: watches a curated US game catalog (`data/game-catalog.json`) and queries Nintendo's official price API (`api.ec.nintendo.com/v1/price`) for authoritative **USD** pricing and sale detection
- Games are reported only while on sale (discount price present and below regular price); non-discounted games are ignored
- US-only: `NINTENDO_REGION` accepts `US` only; EU feed, EUR currency, and Europe URLs removed
- `GAME_COLLECTOR=nintendo` replaces `GAME_COLLECTOR=deku`; `GAME_CATALOG` replaces `DEALS_SOURCE_URL`
- Initial catalog entries verified against the live price API (nsuid/title/ESRB/genres sourced from Nintendo's game-guide index)
- Collector validation rewritten as offline fixture checks (parsing, USD enforcement, sale detection, no-sale and non-USD rejection); `npm run collect-games` exercises the live API
- Docs updated (README, `.env.example`, PRODUCTION.md) including a "Maintaining the game catalog" section and the future automated-discovery path

> **Status: ✅ In progress**

## v0.19 Store Link Quality & Platform Filtering (v0.19.0)

Features:
- Store links are built from a canonical catalog `slug` (`nintendo.com/us/store/products/<slug>/`), never derived from the game title — every reported link resolves (all 11 catalog slugs verified HTTP 200)
- Catalog entries carry `platforms` (`switch1` / `switch2`); `NINTENDO_PLATFORM` (`switch1` | `switch2` | `both`, default `switch1`) filters the catalog before price fetching and analysis
- Entries missing a `slug` are dropped; entries missing `platforms` default to `switch1`
- Collector validation extended with platform checks (resolution/normalization, platform filtering incl. `both`, slug-based URL construction) and default-catalog checks (slug + platforms present, URLs well-formed)
- Docs updated (README, `.env.example`, PRODUCTION.md, ROADMAP)

> **Status: ✅ In progress**

## v0.19 Production Automation (v0.19.1)

Features:
- Daily scheduled digest — the GitHub Actions workflow runs once per day (06:30 UTC) with production configuration (`GAME_COLLECTOR=nintendo`, `EMAIL_PROVIDER=gmail`, `NINTENDO_PLATFORM=switch1`, `DRY_RUN=false`) and emails the digest whenever there are new notifications
- GitHub Actions execution — `NINTENDO_PLATFORM` wired through the scheduled/manual paths (defaults to `switch1`); manual `workflow_dispatch` retained for test runs
- Production secrets — documented required repository secrets (Gmail SMTP, recipients) and optional overrides; `.env.example` notes the CI mapping
- Automated email delivery — normal scheduled (non-dry) runs send the digest and record notifications to history; cooldown/history behavior unchanged; step failures surface in the workflow logs
- New `validate-production` validation covering workflow configuration (cron, manual dispatch, production defaults, secrets), production settings loading, and scheduled-mode behavior (email sent on new notifications; cooldown + unchanged history on re-run); `npm test` aggregates all validation suites

> **Status: ✅ In progress**

## v0.20 Persistent Deal Tracking & Wishlist Watch Digest

Features:
- **Persistent deal tracking** — `data/notification-history.json` becomes a `DealHistory` of `entries[]` (`deal-history`), one per discounted game ever seen: `firstSeenOnSale` / `lastSeenOnSale`, `firstNotified` / `lastNotified` / `lastNotifiedPrice`, `notificationCount`, and `currentlyOnSale`. Legacy `{ records: [...] }` files migrate automatically on first load
- **History reconciliation** — `reconcileDealHistory()` keeps the file accurate without deleting history: creates an entry for a new on-sale game, refreshes `lastSeenOnSale` every run, marks an entry off-sale when a sale ends (preserving the record), and records notification metadata + counts only for emailed games. Free (price 0) games are tracked so they are not re-notified daily. History is saved even when nothing is notified; the raw file changes each real run (last-seen refresh), but entries and notification counts stay stable
- **Still On Sale section** — the digest (and markdown/HTML reports) list already-notified deals that are *still* discounted and not re-reported today, each with `First reported <date> · N days on sale` and a View Deal link; hidden when empty
- **Wishlist Watch section** — every wishlist item with a status (🔥 On Sale / 🎯 Target Price Reached / ⚪ Full Price / ❓ Not Currently Monitored); always renders even when empty
- **Today's Summary** — now 5 metrics: new deals, wishlist games on sale, still-active deals, biggest discount (title + %), and games checked
- **Validation** — `validate-history` rewritten for the deal-history lifecycle (legacy migration, new/deleted/repeated/sale-ended deals, cooldown incl. price-reset and inclusive bounds, free-game tracking); `validate-reports` and `validate-email` cover the new sections; `validate-production` second-run check verifies entry/count stability instead of raw file equality
- Docs updated (README digest layout + persistent deal tracking, PRODUCTION.md, ROADMAP)
- Collector, Nintendo price API, scoring, and family matching are unchanged (out of scope for this task)

> **Status: ✅ Complete**

## v0.21 Expanded US Game Catalog & Catalog Validation

Features:
- **Automated catalog generation** — `npm run generate-catalog` (`src/collectors/generate-catalog.ts`) rebuilds `data/game-catalog.json` from the public US store sitemap (`nintendo.com/us/store/sitemap.xml`) and product-page `__NEXT_DATA__` data, with no manual entry authoring
- **Expanded catalog** — the committed catalog grows from 11 to **300 games**, every one carrying an ESRB rating, 282 with genres, and covering both Switch 1 (271) and Switch 2 (29) titles; flagship Nintendo/Pokémon/indie titles are guaranteed by a curated seed list + family-keyword priority ordering (not alphabetical, which previously starved later families)
- **Quality filtering** — non-game products are excluded by slug markers (DLC/expansion passes/bundles/amiibo/hardware/memberships), `nsuid` prefix (`7001` = standalone software; `7003/7005/7007` = demos/add-ons), and per-language legacy re-releases; titles are normalized to plain ASCII (smart punctuation folded) so wishlist matching is not tripped up by curly apostrophes/accents
- **Catalog validation** — new `src/collectors/catalog-validation.ts` + `validate-collector` checks enforce no duplicate `nsuid`s, no duplicate (case-insensitive) `slug`s, no missing required fields, valid platform values only, well-formed US store URLs, and a minimum catalog size (≥200); the generator validates its own output before writing
- **Wishlist Watch messaging** — statuses updated to ⚪ **Full Price** (monitored, not discounted) vs ⚪ **Not Currently Tracked** (not in the monitored catalog, with an *"Add this game to the monitored catalog to enable price tracking."* hint), backed by `monitoredTitles` on `MonitorResult` / `GameCollector` so real collectors distinguish in-catalog from untracked titles
- **Performance** — the 300-game catalog is fetched in 15 batched price-API requests (~4s), well under budget
- Docs updated (README catalog maintenance + generation + Wishlist Watch, PRODUCTION.md, ROADMAP)
- Analyzer, scoring, digest layout, and notification logic unchanged (out of scope for this task)

> **Status: ✅ Complete**

## v0.22 Excluded Genre Filtering (v0.22.0)

Features:
- **Root cause fixed — genre vocabulary mismatch** — Nintendo's store tags shooter games as "Shooting" (and RPGs as "Role playing"), while family profiles exclude "Shooter" / prefer "RPG", so exact-string matching never fired the hard exclusion filter and games like DOOM slipped through as "recommended"
- **Normalized genre matching** — `family-matcher.ts` gains `normalizeGenre()` which folds variant labels onto one canonical family (Shooting/Shooter/FPS/First-Person Shooter → Shooter; Horror/Survival Horror → Horror; Role playing/RPG → Role-Playing) before comparing against profile `excludedGenres` and `preferredGenres`; unknown labels pass through after case/whitespace folding
- **Excluded genres are a hard filter** — when a game matches any excluded genre for a profile, that profile is blocked (`matched: false`), the exclusion takes precedence over preferred genres (the preferred reason is suppressed), and the blocked profile contributes no family-match bonus to the deal score; the digest already only recommends profiles with `matched: true`
- **Missing genre metadata** — games with no genre data cannot be blocked by genre (documented + tested); the three clearly-shooter catalog entries that lacked genres (Call of Sniper Combat - WW2, Sniper Dan, The GhostX: Sniper Simulator) were given an accurate `Shooting` genre so they are now excluded
- **Validation** — new `npm run validate-analyzer` suite covers: Shooter excluded (both label directions), Horror excluded + variants, preferred/excluded conflict, multiple profiles (blocked for one, matched for another), missing genre metadata, no family bonus for blocked profiles, and real-catalog checks that DOOM + sniper games are not recommended to any profile while LEGO and platform games remain recommended; `npm test` aggregates the suite
- Collector and digest layout unchanged (out of scope for this task)

> **Status: ✅ Complete**

## v0.23 Always-On Wishlist Price Tracking (v0.23.0)

Features:
- **Wishlist Watch shows today's price for every monitored game** — the digest now always renders a current price (and, when discounted, the regular price + 🔥 discount %) for every monitored wishlist item, instead of showing full-price games without any price
- **No duplicate API requests** — `NintendoPriceCollector` keeps a per-run price cache; `collectWishlistPrices()` reuses prices already fetched during deal discovery and requests only the missing nsuids (in the same 20-per-batch pattern), so Wishlist Watch adds at most one extra batched request for full-price wishlist games
- **`GameCollector.collectWishlistPrices(titles)`** — new collector method returning a `Game` for every requested title it monitors regardless of sale status (current price = discount price when on sale, otherwise the regular price); `MockGameCollector` implements it over its sample games
- **Pipeline wiring** — `monitor-run.ts` collects wishlist prices only for monitored wishlist titles absent from the deal results, and stores them on the new `MonitorResult.wishlistGames` field; scoring, family matching, notification logic, and digest layout are unchanged
- **Wording** — email wishlist card labels "Current Price:" and "Regular:" (the struck-through regular price only appears when discounted); statuses and ordering are unchanged (Wishlist Watch still second, right after Today's Summary)
- **Validation** — new `npm run validate-wishlist-price` suite covers full-price/on-sale/target-reached/not-monitored display, that every monitored item exposes a current price, that the collector reuses cached prices (no duplicate requests) and fetches only missing nsuids, and email section ordering; `npm test` aggregates the suite
- Collector, analyzer, scoring, and notification logic unchanged (out of scope for this task)

> **Status: ✅ Complete**

## v0.24 User Game Blacklist (v0.24.0)

Features:
- **Permanently hide unwanted games** — `blacklistedGames` in `data/settings.json` hides shovelware, inappropriate games, and titles the family is not interested in from the daily digest
- **Matching behavior** — exact + case-insensitive match on the normalized title (trimmed + lowercased), so `"Carrot Smash"`, `"carrot smash"`, and `" Carrot Smash "` all match the same entry; an empty array (default) hides nothing
- **Filtering position** — applied right after collection and before analysis (`Collector → Catalog validation → Blacklist filtering → Analyzer → Digest`), so hidden games never reach deal analysis, **Best Deals**, **Recommended For Your Family**, or notification generation; the **Games Checked** statistic still uses the full collection count and collector behavior is untouched
- **Wishlist exception** — a blacklisted game explicitly added to the wishlist stays visible in **Wishlist Watch** with today's price/status (via the existing wishlist-price tracking), but is never recommended or shown as a general deal
- **History** — blacklisted games are not tracked as on-sale in notification history (reconciliation runs on the post-filter list)
- **Validation** — new `npm run validate-blacklist` suite covers removal, case-insensitivity, normalized-title matching, non-blacklisted games unchanged, exclusion from analysis, no notifications (even when wishlisted), the wishlist exception, and absence from every digest section; `npm test` aggregates the suite
- Collector, scoring, family matching, and email layout unchanged (out of scope for this task)

> **Status: ✅ Complete**

## v0.25 User Preferences Moved From Environment To Settings (v0.25.0)

Features:
- **User preferences leave `.env`** — `platform`, `emailProvider`, `dryRun`, `forceEmail`, and `logLevel` are now configured in `data/settings.json` instead of `.env`; `NINTENDO_PLATFORM`, `EMAIL_PROVIDER`, `DRY_RUN`, `FORCE_EMAIL`, and `LOG_LEVEL` were removed from `.env.example` (which now keeps only secrets and environment-specific values)
- **Clear precedence** — environment variable > `data/settings.json` > built-in default, so GitHub Actions / CI can still override any user preference per run; `.env` / GitHub secrets continue to work as overrides
- **New preferences resolver** — `src/config/preferences.ts` loads the five preference keys from `data/settings.json` (sharing the file with notification settings), validates them, and merges env overrides; `AppConfig` now exposes `preferences`, and the collector's `platform` comes from the resolved preference
- **Runtime logging** — startup now prints the resolved values: `Dry run: enabled/disabled` and `Force email: enabled/disabled` (alongside Collector/Region/Platform/Email/score/cooldown), so the effective configuration is visible each run
- **Validation** — new `npm run validate-preferences` suite covers: settings values load, partial merge with defaults, env overrides settings, env normalization, invalid values rejected, and that app config exposes preferences (collector platform matches); `npm test` aggregates the suite, and the existing dry-run/force-email/production suites still pass with env overrides
- Collector, analyzer, digest layout, and notification behavior unchanged (out of scope for this task)

> **Status: 🔄 In progress**

## v0.26 Recommendations Restricted To Relevant Deals (v0.26.0)

Features:
- **Deal-focused family recommendations** — **Recommended For Your Family** now only shows actionable games: currently discounted, free, or active historical deals still on sale. Full-price catalog games (even ones that match a family profile, and even wishlist ones) are no longer recommended; they remain visible in **Wishlist Watch** only (`⚪ Full Price`)
- **Price status on recommendations** — every recommended game shows its price status (e.g. `🔥 -90%` + current price, or `🆓 Free to download`), so a recommendation in a deal alert reads as something worth checking today; `DigestRecommendationGame` carries `currentPrice`, `originalPrice`, `discountPercent`, and `isFree`, rendered in both the email and markdown report
- **Eligibility** — a game is recommendable when it is free, discounted (`originalPrice > currentPrice`), or tracked as `currentlyOnSale` in deal history; the filter lives in `daily-digest-builder.ts`
- **Validation** — new `npm run validate-recommendations` suite covers: discounted family match appears, full-price family match excluded, full-price wishlist game excluded (but kept in Wishlist Watch), active historical deal remains visible, free games remain visible, and that recommended games expose + render price status; `npm test` aggregates the suite
- Collector, catalog generation, and blacklist unchanged (out of scope for this task)
