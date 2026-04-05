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

The client talks to the API at `http://localhost:5174` by default.

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

## Next step after this

Once you are happy with the round-one view, the natural extension is to add round two, quarterfinals, semifinals, and the final, then score each pool entry as players keep progressing.
