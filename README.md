<img width="474" height="110" alt="image" src="https://github.com/user-attachments/assets/57dc1bf8-19b5-45ba-b7fd-d4fb6dd111d3" />

## What This Does

Setting up OAuth involves navigating multiple console pages, copying IDs, and managing credentials. This CLI walks you through the entire process interactively - fetching your Google Cloud projects, opening the right console pages, validating your inputs, and saving credentials wherever you need them.

## Features

- **Google OAuth** - Fetches your GCP projects, opens consent screen and credentials pages, captures client ID/secret
- **GitHub OAuth Apps** - One-click GitHub App manifest or manual OAuth App setup
- **Smart defaults** - Remembers your current gcloud project, suggests callback URLs
- **Flexible output** - Save to `.env`, `.env.local`, `.json`, or just print to console
- **Non-interactive mode** - `--no-open` flag for CI/automated environments

## Installation

```bash
# Using bun (recommended)
bun install -g oauth-init

# Using npm
npm install -g oauth-init
```

## Usage

```bash
# Run interactive setup
oauth-init

# Run without opening browser pages
oauth-init --no-open

# Minimal output
oauth-init --quiet
```

The CLI will:
1. Ask for your project name
2. Select which OAuth providers to configure
3. Guide you through each provider's setup flow
4. Save credentials to your chosen location

## Supported Providers

| Provider | Setup Type |
|----------|------------|
| Google | OAuth 2.0 (External) |
| GitHub | OAuth App, GitHub App |

## Tech Stack

- **Runtime**: Bun
- **CLI UI**: @clack/prompts
- **Shell**: execa
- **Browser**: open

## How It Works

The CLI orchestrates the OAuth setup by:

1. **Discovery** - Uses `gcloud` CLI to fetch your Google Cloud projects
2. **Navigation** - Opens the correct Google Cloud Console and GitHub pages
3. **Capture** - Prompts for client ID and secret with validation
4. **Output** - Writes credentials to the chosen format

## License

MIT
