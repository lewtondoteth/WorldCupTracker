# Snooker Pool Tracker Tutorial

This project now starts with one clear slice of functionality: the opening round of the 2025 World Snooker Championship.

Important event details:
- Tournament: World Championship 2025
- Dates: 19 April 2025 to 5 May 2025
- snooker.org event id: `1942`
- Round used for the first version of the tracker: `Round 1` (API round `7`, 32 players left)

## What this version does

- Pulls the live 2025 World Championship field and round-one results from `api.snooker.org`
- Splits the draw into 16 seeds and 16 qualifiers
- Loads a pool file from the backend
- Shows 4 sample competitors with a demo file that splits the 32-player field uniquely across them
- Strikes through players who lost in round one
- Lets you upload a replacement JSON picks file from the browser

## Where the pool file lives

The generated sample file is stored at:

`server/data/pools/world-championship-2025.json`

The backend also returns the exact file path in the UI so you can confirm which file is active.

## Pool file format

Use this JSON shape when you want to upload a new file:

```json
{
  "year": 2025,
  "eventName": "World Championship 2025",
  "competitors": [
    {
      "name": "Alex Turner",
      "seedIds": [39, 12, 237, 17],
      "qualifierIds": [2498, 946, 1044, 1417]
    }
  ]
}
```

Rules for each competitor:
- `seedIds` can contain between 1 and 8 players from the 16 seeded Crucible entrants
- `qualifierIds` can contain between 1 and 8 players from the 16 qualifiers
- Each list must use numeric player ids from snooker.org
- No duplicates are allowed inside a single list

The generated demo file uses 4 seeded picks and 4 qualifier picks per fake user so all 32 entrants are covered exactly once.

## Run it locally

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

Then open the Vite URL, normally `http://localhost:5173`.

The backend still runs on `http://localhost:5174`, and the Vite dev server proxies `/api/*` requests there for you.

In local development, the Vite dev server now proxies `/api/*` requests to the backend automatically, so you can also just use the Vite URL without setting `VITE_API_BASE`.

## Environment-aware behaviour

The app now chooses sensible defaults based on where it is running:

- Local development:
  - environment defaults to `local`
  - API calls use the Vite dev proxy unless you set `VITE_API_BASE`
  - mutable data defaults to `server/data`
  - live tournament refresh defaults to on
- Railway deployment:
  - environment defaults to `railway`
  - API calls use same-origin `/api`
  - mutable data defaults to `DATA_DIR` or Railway's `RAILWAY_VOLUME_MOUNT_PATH`
  - live tournament refresh defaults to off unless you enable it

You can inspect the active backend environment at `GET /api/health`.

## Backend endpoints

- `GET /api/health` checks that the server is alive
- `GET /api/world-championship/2025/round-one` returns the live 2025 round-one snapshot
- `GET /api/pool/2025` returns the snapshot plus the current competitor picks file
- `POST /api/pool/2025/upload` replaces the backend picks file with uploaded JSON

## How the live data works

The server calls these snooker.org endpoints:
- `/?t=5&s=2024&tr=main` to discover the 2025 event when needed
- `/?t=9&e=1942` for event players
- `/?t=12&e=1942` for round information
- `/?t=6&e=1942` for match results
- `/?t=13&e=1942` for seeding

The existing SQLite cache is still used as a fallback for the 32-player field if the live player request is unavailable.

## Railway deployment model

The app now supports two storage modes:

- Local development: pool data and entrants are read from `server/data/*.json` and can still be edited locally.
- Railway production: pool data and entrants are stored on a persistent mounted volume so deployment updates change code only, not live data.

The production storage behavior is designed for a one-time migration:

- On the first production request, if the mounted data files do not exist yet, the server seeds them from the checked-in local JSON files.
- After that, the app reads and writes the mounted volume copy.
- Future GitHub or Railway deployments do not overwrite the live volume data unless you explicitly clear the volume.

Tournament snapshots remain checked-in static JSON by default so the deployed app is predictable and does not depend on runtime writes.

### Required Railway setup

1. Deploy the repo to a single Railway service.
2. Add a persistent volume to that service.
3. Mount the volume. The app will automatically use Railway's `RAILWAY_VOLUME_MOUNT_PATH`, or you can set `DATA_DIR` if you want a specific subdirectory such as `/data/snooker`.
4. Open the deployed app once to trigger the one-time seed from the existing `server/data` files into the volume.

Optional environment variables:

- `APP_ENV` if you want to force a label such as `local`, `staging`, or `railway`.
- `LIVE_TOURNAMENT_DATA=true` if you want the server to refresh tournament snapshots from snooker.org instead of relying on checked-in static files.
- `VITE_APP_ENV` if you want the frontend to expose a custom environment label.
- `VITE_API_BASE` if you want the frontend to target a specific API origin during development.

## Next step after this

Once you are happy with the round-one view, the natural extension is to add round two, quarterfinals, semifinals, and the final, then score each pool entry as players keep progressing.
