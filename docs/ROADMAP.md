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
