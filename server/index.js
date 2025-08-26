console.log('=== SERVER STARTED: index.js loaded ===');


import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { filterLast32 } from "./last32.js";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { cacheLast32, getCachedLast32 } from "./sqlite_cache.mjs";

const app = express();
app.use(cors()); // front-end on a different port during dev

const SN_API = "https://api.snooker.org";
const SN_HEADER = { "X-Requested-By": "NicholasAndroidApp" };

/**
 * Option A: use the known 2024 WC event id (1460)
 * GET /api/players/2024
 */

// Generalized endpoint for any year (default event id for 2024 is 1460)
app.get("/api/players/:year", async (req, res) => {
  const year = Number(req.params.year);
  console.log(`[API] /api/players/${year} called`);
  if (!year || year < 2000 || year > 2100) {
    console.log(`[API] Invalid year: ${year}`);
    return res.status(400).json({ error: "Invalid year" });
  }

  // Try cache first
  console.log(`[API] Checking cache for year ${year}`);
  const cached = getCachedLast32(year);
  if (cached) {
    console.log(`[API] Serving last 32 for ${year} from cache`);
    return res.json(cached);
  }

  // Map year to event id (2024: 1460, 2023: 1422, etc.)
  // For now, hardcode 2024, fallback to 2024 if unknown
  const eventIds = { 2024: 1460, 2023: 1422, 2022: 1377, 2021: 1322, 2020: 1262 };
  const eventId = eventIds[year] || 1460;
  try {
    console.log(`[API] Fetching players for eventId ${eventId}`);
    // 1. Get all players in the event
    const playersUrl = `${SN_API}/?t=9&e=${eventId}`;
    const playersRes = await fetch(playersUrl, { headers: SN_HEADER });
    if (!playersRes.ok) {
      const errorText = await playersRes.text();
      console.log(`[API] Error fetching players: ${playersRes.status} - ${errorText}`);
      return res.status(playersRes.status).send(errorText);
    }
    const allPlayers = await playersRes.json();

    // 2. Get round info for the event
    console.log(`[API] Fetching rounds for eventId ${eventId}`);
    const roundsUrl = `${SN_API}/?t=12&e=${eventId}`;
    const roundsRes = await fetch(roundsUrl, { headers: SN_HEADER });
    if (!roundsRes.ok) {
      console.log(`[API] Error fetching rounds: ${roundsRes.status}`);
      return res.status(roundsRes.status).send(await roundsRes.text());
    }
    const rounds = await roundsRes.json();
    // Find the round with 32 players left (main draw/last 32)
    const last32Round = rounds.find(r => Number(r.NumLeft) === 32 && r.EventID == eventId);
    if (!last32Round) {
      console.log(`[API] Last 32 round not found for eventId ${eventId}`);
      return res.status(404).json({ error: "Last 32 round (NumLeft=32) not found" });
    }

    // 3. Get all matches for the event
    console.log(`[API] Fetching matches for eventId ${eventId}`);
    const matchesUrl = `${SN_API}/?t=6&e=${eventId}`;
    const matchesRes = await fetch(matchesUrl, { headers: SN_HEADER });
    if (!matchesRes.ok) {
      console.log(`[API] Error fetching matches: ${matchesRes.status}`);
      return res.status(matchesRes.status).send(await matchesRes.text());
    }
    const matches = await matchesRes.json();

    // 4. Filter matches for the last 32 round
    const last32Matches = matches.filter(m => String(m.Round) === String(last32Round.Round));
    console.log(`[API] Found ${last32Matches.length} last32 matches`);

    // 5. Extract player IDs from those matches
    const playerIDs = new Set();
    last32Matches.forEach(m => {
      if (m.Player1ID) playerIDs.add(String(m.Player1ID));
      if (m.Player2ID) playerIDs.add(String(m.Player2ID));
    });
    console.log(`[API] Extracted ${playerIDs.size} player IDs for last32`);

    // 6. Filter players to only those in the last 32 (compare as strings)
    const filtered = allPlayers.filter(p => playerIDs.has(String(p.ID)));
    console.log(`[API] Filtered to ${filtered.length} players for last32`);

    // Cache the result
    cacheLast32(year, filtered);
    console.log(`[API] Cached last 32 for ${year}`);
    res.json(filtered);
  } catch (err) {
    console.log(`[API] Error in handler:`, err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Option B: resolve the event id programmatically
 * - find World Championship in season 2023 (i.e., 2023/2024)
 * - then list players (t=9)
 * GET /api/players/by-discovery
 */
app.get("/api/players/by-discovery", async (_req, res) => {
  try {
    // list events in 2023/24 main tour
    const eventsUrl = `${SN_API}/?t=5&s=2023&tr=main`;
    const eventsRes = await fetch(eventsUrl, { headers: SN_HEADER });
    if (!eventsRes.ok) return res.status(eventsRes.status).send(await eventsRes.text());
    const events = await eventsRes.json();

    // find the event whose name contains "World Championship" and year 2024
    const wc = events.find(ev =>
      /World Championship/i.test(ev.Name ?? ev.Event) &&
      /2024/.test(ev.Name ?? ev.Event)
    );
    if (!wc?.ID) return res.status(404).json({ error: "World Championship 2024 not found" });

    const playersUrl = `${SN_API}/?t=9&e=${wc.ID}`;
    const playersRes = await fetch(playersUrl, { headers: SN_HEADER });
    if (!playersRes.ok) return res.status(playersRes.status).send(await playersRes.text());
    const players = await playersRes.json();

    res.json({ event: wc, players });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 5174; // pick a port not used by Vite
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
