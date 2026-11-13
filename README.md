# Hive Bedwars -> Discord Live Widget Synchronizer

Automated 24/7 background sync between **The Hive Minecraft (Bedwars)** player stats and **Discord Game Stats Widgets** using GitHub Actions.

## How it works
1. Runs automatically every 5 minutes via GitHub Actions cron (free & unlimited in public repositories).
2. Polls `https://api.playhive.com/v0/game/all/bed/NIVYT`.
3. Patches the Discord widget configuration and publishes the update live.

## Setup Instructions

1. Push this repository to GitHub as a **Public** repository (unlimited free GitHub Actions).
2. Go to your repository on GitHub -> **Settings** -> **Secrets and variables** -> **Actions**.
3. Click **New repository secret**:
   - **Name**: `DISCORD_AUTH_TOKEN`
   - **Secret**: Paste your Discord Developer Portal Authorization header.
4. Go to the **Actions** tab on GitHub -> Click **Sync Hive Bedwars to Discord Widget** -> Click **Run workflow** to test!
