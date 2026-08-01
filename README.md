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
- GitHub Actions for scheduled execution

## Getting Started

```bash
npm install
cp .env.example .env   # then fill in values
```

### Scripts

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `npm run build`    | Compile TypeScript to `dist/`             |
| `npm run start`    | Run the compiled service (`dist/main.js`) |
| `npm run dev`      | Run the service in watch/dev mode         |

## Project Structure

```
├── docs/              # Roadmap and planning docs
├── src/
│   ├── collectors/    # Nintendo Switch data collection (planned)
│   ├── analyzer/      # Deal scoring and recommendations (planned)
│   ├── notifications/ # HTML email templates + SMTP (planned)
│   ├── models/        # Shared domain types (planned)
│   └── main.ts        # Service entry point
├── data/              # Runtime data / cache
└── .github/workflows  # Scheduled execution (planned)
```

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full milestone plan.
