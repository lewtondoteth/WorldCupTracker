import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cacheLast32, getCachedLast32 } from "./sqlite_cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 5174);
const SN_API = "https://api.snooker.org";
const SN_REQUESTED_BY = process.env.SNOOKER_ORG_REQUESTED_BY || "";
const WORLD_CHAMPIONSHIP_EVENT_IDS = {
  2025: 1942,
  2024: 1460,
};
const ROUND_ONE_SIZE = 32;
const POOL_DIR = path.join(__dirname, "data", "pools");
const STATIC_DIR = path.join(__dirname, "data", "static");

function getPoolFilePath(year) {
  return path.join(POOL_DIR, `world-championship-${year}.json`);
}

function getStaticSnapshotPath(year) {
  return path.join(STATIC_DIR, `world-championship-${year}-round-one.json`);
}

function playerLabel(player) {
  return (player.Name || `${player.FirstName ?? ""} ${player.LastName ?? ""}`).replace(/\s+/g, " ").trim();
}

async function fetchJson(url) {
  const headers = SN_REQUESTED_BY ? { "X-Requested-By": SN_REQUESTED_BY } : {};
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    const guidance = response.status === 403
      ? " Set SNOOKER_ORG_REQUESTED_BY in the server environment to your approved snooker.org header value."
      : "";
    throw new Error(`snooker.org request failed (${response.status}).${guidance}`);
  }

  return response.json();
}

async function resolveWorldChampionshipEventId(year) {
  if (WORLD_CHAMPIONSHIP_EVENT_IDS[year]) {
    return WORLD_CHAMPIONSHIP_EVENT_IDS[year];
  }

  const season = year - 1;
  const events = await fetchJson(`${SN_API}/?t=5&s=${season}&tr=main`);
  const event = events.find((item) => {
    const name = item.Name || item.Event || "";
    return /World Championship/i.test(name) && item.Stage === "F" && String(item.StartDate || "").startsWith(String(year));
  });

  if (!event?.ID) {
    throw new Error(`World Championship event id not found for ${year}`);
  }

  return Number(event.ID);
}

async function fetchLast32Players(year, eventId) {
  try {
    const [allPlayers, rounds, matches] = await Promise.all([
      fetchJson(`${SN_API}/?t=9&e=${eventId}`),
      fetchJson(`${SN_API}/?t=12&e=${eventId}`),
      fetchJson(`${SN_API}/?t=6&e=${eventId}`),
    ]);

    const round = rounds.find((item) => Number(item.EventID) === eventId && Number(item.NumLeft) === ROUND_ONE_SIZE);
    if (!round) {
      throw new Error(`Round-of-32 not found for event ${eventId}`);
    }

    const ids = new Set();
    for (const match of matches) {
      if (String(match.Round) !== String(round.Round)) {
        continue;
      }
      ids.add(Number(match.Player1ID));
      ids.add(Number(match.Player2ID));
    }

    const filtered = allPlayers.filter((player) => ids.has(Number(player.ID)));
    if (filtered.length === ROUND_ONE_SIZE) {
      cacheLast32(year, filtered);
    }
    return filtered;
  } catch (error) {
    const cached = getCachedLast32(year);
    if (cached?.length === ROUND_ONE_SIZE) {
      return cached;
    }
    throw error;
  }
}

async function buildLiveRoundOneSnapshot(year) {
  const eventId = await resolveWorldChampionshipEventId(year);
  const [players, rounds, matches, seedings] = await Promise.all([
    fetchLast32Players(year, eventId),
    fetchJson(`${SN_API}/?t=12&e=${eventId}`),
    fetchJson(`${SN_API}/?t=6&e=${eventId}`),
    fetchJson(`${SN_API}/?t=13&e=${eventId}`),
  ]);

  const round = rounds.find((item) => Number(item.EventID) === eventId && Number(item.NumLeft) === ROUND_ONE_SIZE);
  if (!round) {
    throw new Error(`Round-of-32 metadata missing for ${year}`);
  }

  const roundMatches = matches
    .filter((item) => String(item.Round) === String(round.Round))
    .sort((a, b) => Number(a.Number) - Number(b.Number));

  if (roundMatches.length !== 16) {
    throw new Error(`Expected 16 round-one matches for ${year}, found ${roundMatches.length}`);
  }

  const playersById = new Map(
    players.map((player) => [
      Number(player.ID),
      {
        id: Number(player.ID),
        name: playerLabel(player),
        nationality: player.Nationality || "",
        photo: player.Photo || "",
      },
    ]),
  );

  const seedingById = new Map(seedings.map((item) => [Number(item.PlayerID), Number(item.Seeding)]));
  const entrantsById = new Map();

  const enrichedMatches = roundMatches.map((match) => {
    const player1 = playersById.get(Number(match.Player1ID));
    const player2 = playersById.get(Number(match.Player2ID));

    if (!player1 || !player2) {
      throw new Error(`Missing player details for match ${match.ID}`);
    }

    const winnerId = Number(match.WinnerID);
    const loserId = winnerId === player1.id ? player2.id : player1.id;

    const side1 = {
      ...player1,
      seedNumber: seedingById.get(player1.id) || null,
      isSeed: (seedingById.get(player1.id) || 99) <= 16,
      score: Number(match.Score1),
    };
    const side2 = {
      ...player2,
      seedNumber: seedingById.get(player2.id) || null,
      isSeed: (seedingById.get(player2.id) || 99) <= 16,
      score: Number(match.Score2),
    };

    for (const side of [side1, side2]) {
      entrantsById.set(side.id, {
        ...side,
        roundOneResult: side.id === winnerId ? "won" : "lost",
      });
    }

    return {
      id: Number(match.ID),
      number: Number(match.Number),
      scheduledDate: match.ScheduledDate || match.StartDate || "",
      winnerId,
      loserId,
      player1: side1,
      player2: side2,
    };
  });

  const entrants = Array.from(entrantsById.values()).sort((a, b) => {
    const seedA = a.seedNumber || 999;
    const seedB = b.seedNumber || 999;
    if (seedA !== seedB) {
      return seedA - seedB;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    year,
    eventId,
    eventName: `World Championship ${year}`,
    eventDates: {
      start: `${year}-04-19`,
      end: `${year}-05-05`,
    },
    round: {
      id: Number(round.Round),
      name: round.RoundName,
      matchCount: roundMatches.length,
    },
    entrants,
    seeds: entrants.filter((entry) => entry.isSeed),
    qualifiers: entrants.filter((entry) => !entry.isSeed),
    matches: enrichedMatches,
    dataSource: "live",
    liveError: null,
  };
}

async function readStaticSnapshot(year) {
  const filePath = getStaticSnapshotPath(year);
  const raw = await fs.readFile(filePath, "utf8");
  const snapshot = JSON.parse(raw);
  return {
    ...snapshot,
    dataSource: "static-fallback",
  };
}

async function getRoundOneSnapshot(year) {
  try {
    return await buildLiveRoundOneSnapshot(year);
  } catch (error) {
    const fallback = await readStaticSnapshot(year);
    return {
      ...fallback,
      liveError: String(error.message || error),
    };
  }
}

async function readPoolFile(year) {
  const filePath = getPoolFilePath(year);
  const raw = await fs.readFile(filePath, "utf8");
  return {
    filePath,
    data: JSON.parse(raw),
  };
}

async function writePoolFile(year, payload) {
  await fs.mkdir(POOL_DIR, { recursive: true });
  const filePath = getPoolFilePath(year);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

function normaliseIds(ids, allowed, label) {
  if (!Array.isArray(ids)) {
    throw new Error(`${label} must be an array of player ids`);
  }

  const parsed = ids.map((value) => Number(value));
  if (parsed.some((value) => Number.isNaN(value))) {
    throw new Error(`${label} contains a non-numeric player id`);
  }
  if (parsed.length !== 8) {
    throw new Error(`${label} must contain exactly 8 players`);
  }
  if (new Set(parsed).size !== parsed.length) {
    throw new Error(`${label} contains duplicate players`);
  }
  if (parsed.some((value) => !allowed.has(value))) {
    throw new Error(`${label} includes a player outside the 2025 round-one field`);
  }
  return parsed;
}

function buildPoolResponse(snapshot, poolData, filePath) {
  if (!Array.isArray(poolData?.competitors) || poolData.competitors.length === 0) {
    throw new Error("Pool file must contain a non-empty competitors array");
  }

  const entrantsById = new Map(snapshot.entrants.map((entry) => [entry.id, entry]));
  const validSeedIds = new Set(snapshot.seeds.map((entry) => entry.id));
  const validQualifierIds = new Set(snapshot.qualifiers.map((entry) => entry.id));

  const competitors = poolData.competitors.map((competitor) => {
    if (!competitor?.name) {
      throw new Error("Each competitor needs a name");
    }

    const seedIds = normaliseIds(competitor.seedIds, validSeedIds, `${competitor.name} seedIds`);
    const qualifierIds = normaliseIds(competitor.qualifierIds, validQualifierIds, `${competitor.name} qualifierIds`);

    const decorate = (playerId) => {
      const player = entrantsById.get(playerId);
      return {
        ...player,
        eliminated: player.roundOneResult === "lost",
      };
    };

    const seeds = seedIds.map(decorate);
    const qualifiers = qualifierIds.map(decorate);

    return {
      name: competitor.name,
      seeds,
      qualifiers,
      liveCount: [...seeds, ...qualifiers].filter((player) => !player.eliminated).length,
    };
  });

  return {
    snapshot,
    competitors,
    sourceFile: filePath,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/world-championship/:year/round-one", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const snapshot = await getRoundOneSnapshot(year);
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/pool/:year", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const [snapshot, poolFile] = await Promise.all([getRoundOneSnapshot(year), readPoolFile(year)]);
    res.json(buildPoolResponse(snapshot, poolFile.data, poolFile.filePath));
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post("/api/pool/:year/upload", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const snapshot = await getRoundOneSnapshot(year);
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Upload body must be JSON" });
    }

    const filePath = await writePoolFile(year, payload);
    res.json(buildPoolResponse(snapshot, payload, filePath));
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.listen(PORT, () => {
  console.log(`Snooker pool server listening on http://localhost:${PORT}`);
  if (SN_REQUESTED_BY) {
    console.log("snooker.org live mode enabled via SNOOKER_ORG_REQUESTED_BY");
  } else {
    console.log("snooker.org live mode disabled. Using static fallback until SNOOKER_ORG_REQUESTED_BY is set.");
  }
});
