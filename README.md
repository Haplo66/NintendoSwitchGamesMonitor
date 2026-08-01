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

### Sending a test email

```bash
npm run test-email
```

This builds the project, generates a sample `NotificationReport`, renders it to HTML, and sends it via Gmail SMTP.

### Required environment variables

| Variable        | Description                                                                  |
| --------------- | ---------------------------------------------------------------------------- |
| `SMTP_HOST`     | SMTP server host (default: `smtp.gmail.com`)                                 |
| `SMTP_PORT`     | SMTP port (default: `465` for implicit TLS; 587 is also supported)           |
| `SMTP_USER`     | Gmail address used for authentication (and the email `From` address)         |
| `SMTP_PASSWORD` | Gmail App Password (regular account passwords are rejected by Gmail)         |
| `EMAIL_TO`      | Recipient address the notification emails are sent to                        |

Copy `.env.example` to `.env` and fill in real values before running `npm run test-email`.

## Getting Started

```bash
npm install
cp .env.example .env   # then fill in values
```

### Scripts

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `npm run build`    | Compile TypeScript to `dist/`                  |
| `npm run start`    | Run the compiled service (`dist/main.js`)      |
| `npm run dev`      | Run the service in watch/dev mode              |
| `npm run test-email` | Build and send a sample HTML test notification |

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
│   │   ├── gmail-provider.ts
│   │   └── test-email.ts
│   ├── models/        # Shared domain types (GameDeal, NotificationReport, ...)
│   └── main.ts        # Service entry point
├── data/              # Runtime data / cache
└── .github/workflows  # Scheduled execution (planned)
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full milestone plan.
