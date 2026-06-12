# WorldCupPool

This repo is the active FIFA World Cup pool site, rebuilt from the finished baseline app structure while keeping the World Cup-specific data model and pool workflow.

## What It Does

- Keeps the polished pool/admin/entrant/winner workflow from the finished baseline
- Uses World Cup teams, groups, fixtures, knockout rounds, standings, and winners throughout the product
- Uses `football-data.org` for live World Cup tournament data, including the 2026 competition
- Keeps a static 2022 fallback snapshot available if live data is disabled

## Current Data Model

- `Bucket A` and `Bucket B` are the two internal assignment buckets used for pool picks
- Public pages cover:
  - `/structure` for group tables plus the compact knockout overview
  - `/entrants` for entrant picks and team ownership
  - `/fixtures` for tournament stages, filters, and results
  - `/table` for the group-stage / knockout switcher
  - `/winners` for pool winners by year
- The backend exposes World Cup-oriented endpoints while keeping the pool/admin endpoints compatible with the existing UI flow

## Run Locally

Run one command from the repo root:

```bash
npm run dev
```

That starts:

- the backend on `http://localhost:5174`
- the frontend on `http://localhost:5173`

If you want to run them separately, you still can with two terminals:

Server:

```bash
cd server
npm run dev
```

Client:

```bash
cd client
npm run dev
```

Then open the Vite URL, usually `http://localhost:5173`.

The backend still runs on `http://localhost:5174`, and Vite proxies `/api/*` requests there automatically in local development.

## Admin Password

The current admin password is:

```text
ears
```

## Important Files

- [server/index.js](/home/add/Documents/Dev/WorldCupPool/server/index.js) contains the football-specific API layer
- [server/world-cup-data.mjs](/home/add/Documents/Dev/WorldCupPool/server/world-cup-data.mjs) contains the static 2022 fallback snapshot and the empty upcoming 2026 snapshot
- [server/storage.mjs](/home/add/Documents/Dev/WorldCupPool/server/storage.mjs) now stores `world-cup-*.json` pool files
- [client/src/App.jsx](/home/add/Documents/Dev/WorldCupPool/client/src/App.jsx) contains the World Cup public/admin UI, routing, and tournament presentation

## Live API Integration Later

The backend is already wired for `football-data.org`.

To enable it locally:

1. Copy [server/.env.example](/home/add/Documents/Dev/WorldCupPool/server/.env.example) to `server/.env.local`, or export the vars in your shell.
2. Set `FOOTBALL_API_KEY` to your personal token.
3. Leave `LIVE_TOURNAMENT_DATA=true`.

The live provider:

- Uses `X-Auth-Token`
- Checks `X-RequestsAvailable` and `X-RequestCounter-Reset`
- Caches World Cup snapshots server-side to reduce rate-limit pressure
- Uses live data for both `2022` and `2026` when the upstream API returns those resources
- Falls back to static `2022` data automatically if the API errors
- Falls back to the `2026` upcoming shell if the live API is unavailable or incomplete

## Deploy To Railway

This repo is ready to deploy on Railway with the included [Dockerfile](/home/add/Documents/Dev/WorldCupPool/Dockerfile) and [railway.toml](/home/add/Documents/Dev/WorldCupPool/railway.toml).

Recommended setup:

1. Create a new Railway project from this repo.
2. Add these environment variables in Railway:
   - `FOOTBALL_API_KEY`: your football-data.org API token
   - `LIVE_TOURNAMENT_DATA=true`
   - `FOOTBALL_API_BASE_URL=https://api.football-data.org/v4`
3. Add a persistent volume in Railway and mount it somewhere like `/data`.
4. Set `DATA_DIR=/data` so pool files, entrants, site settings, and live cache survive deploys/restarts.

Notes:

- Railway will provide `PORT` automatically.
- The app exposes a healthcheck at `/api/health`.
- `APP_ENV` does not need to be set manually; the server already detects Railway.
- The app serves the built client from the Express server, so you only need one Railway service.

## Remaining Live API Work

1. Replace the empty `2026` shell with real 2026 data once FIFA publishes the final field and fixtures in the API.
2. Improve head-to-head history beyond same-competition matches if you want broader international history.
3. Surface partial live `2026` cache data more gracefully when the upstream API rate-limits before standings and matches complete.
