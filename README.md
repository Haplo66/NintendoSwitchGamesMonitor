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

Copy `.env.example` to `.env` and fill in real values before running `npm run test-email` with the `gmail` provider.

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

## Project Structure

```
├── docs/              # Roadmap and planning docs
├── src/
│   ├── collectors/    # Nintendo Switch data collection (planned)
│   ├── analyzer/      # Deal scoring and recommendations (planned)
│   ├── notifications/ # Email system: templates, renderer, providers
│   │   ├── email-template.ts
│   │   ├── email-renderer.ts
│   │   ├── email-provider.ts
│   │   ├── email-factory.ts
│   │   ├── gmail-provider.ts
│   │   ├── mock-email-provider.ts
│   │   ├── email-validation.ts
│   │   └── test-email.ts
│   ├── models/        # Shared domain types (GameDeal, NotificationReport, ...)
│   └── main.ts        # Service entry point
├── data/              # Runtime data / cache
└── .github/workflows  # Scheduled execution (planned)
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full milestone plan.
