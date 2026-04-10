# WorldCupPool

This repo is a separate copy of the original app, adapted into a FIFA World Cup pool tracker. The original `SnookerSite` repo is left untouched.

## What It Does

- Keeps the existing pool/admin/entrant/winner workflow
- Replaces the snooker event model with World Cup teams, groups, fixtures, knockout rounds, and winners
- Seeds the app with static FIFA World Cup 2022 results so the site is testable immediately
- Uses the 2022 tournament as demo data for the `2026` tracker view until a live football API is connected

## Current Data Model

- `Group winners` and `Runners-up` are the two assignment buckets used for pool picks
- Public pages cover:
  - `/teams` for group tables and entrant picks
  - `/fixtures` for tournament stages and results
  - `/knockout` for the knockout bracket
  - `/winners` for pool winners by year
- The backend exposes World Cup-oriented endpoints while keeping the pool/admin endpoints compatible with the existing UI flow

## Run Locally

Open two terminals.

Server:

```bash
cd server
npm run dev
```

Client:

```bash
cd client
npm install
npm run dev
```

Then open the Vite URL, usually `http://localhost:5173`.

The backend still runs on `http://localhost:5174`, and Vite proxies `/api/*` requests there automatically in local development.

## Important Files

- [server/index.js](/home/add/Documents/Dev/WorldCupPool/server/index.js) contains the football-specific API layer
- [server/world-cup-data.mjs](/home/add/Documents/Dev/WorldCupPool/server/world-cup-data.mjs) contains the static 2022 tournament dataset and snapshot builder
- [server/storage.mjs](/home/add/Documents/Dev/WorldCupPool/server/storage.mjs) now stores `world-cup-*.json` pool files
- [client/src/App.jsx](/home/add/Documents/Dev/WorldCupPool/client/src/App.jsx) contains the rethemed public/admin UI and route updates

## Live API Integration Later

The backend is already wired for `football-data.org` and falls back to the static 2022 dataset if the live API errors or has no suitable data yet.

To enable it locally:

1. Copy [server/.env.example](/home/add/Documents/Dev/WorldCupPool/server/.env.example) to a local env file or export the vars in your shell.
2. Set `FOOTBALL_API_KEY` to your personal token.
3. Leave `LIVE_TOURNAMENT_DATA=true`.

The live provider:

- Uses `X-Auth-Token`
- Checks `X-RequestsAvailable` and `X-RequestCounter-Reset`
- Caches World Cup snapshots server-side to reduce rate-limit pressure
- Falls back to static data automatically if the API errors or a season is unavailable

## Remaining Live API Work

1. Decide how you want 2026 handled before FIFA publishes a full tournament structure in the API.
2. Improve head-to-head history beyond same-competition matches if you want broader international history.
3. Add a local `.env` loading strategy if you want one-command startup without exporting vars manually.
