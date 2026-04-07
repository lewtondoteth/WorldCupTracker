import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { existsSync, promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { runtimeConfig } from "./env.mjs";
import {
  getStaticSnapshotPath,
  readEntrantRegistry,
  readPlayerOverrides,
  readSiteSettings,
  readPoolFileOptional,
  writeEntrantRegistry,
  writePlayerOverrides,
  writeSiteSettings,
  writePoolFile,
} from "./storage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_DIR = path.join(__dirname, "..", "client", "dist");
const app = express();

app.use(cors());
app.use(async (_req, res, next) => {
  try {
    if (!currentSiteSettings.clacksNames.length) {
      await loadCurrentSiteSettings();
    }

    const headerValue = formatClacksHeaderValue(currentSiteSettings.clacksNames || []);
    if (headerValue) {
      res.set("X-Clacks-Overhead", headerValue);
    }
  } catch (error) {
    console.warn("[site-settings] failed to load clacks header:", error?.message || error);
  }

  next();
});
app.use(express.json({ limit: "1mb" }));

const PORT = runtimeConfig.port;
const SN_API = "https://api.snooker.org";
const SN_REQUESTED_BY = runtimeConfig.snookerRequestedBy;
const WORLD_CHAMPIONSHIP_EVENT_IDS = {
  2025: 1942,
  2024: 1460,
};
const MAIN_DRAW_ROUNDS = [
  { key: "round-1", id: 7, name: "Round 1", shortLabel: "R1", entrantsLeft: 32 },
  { key: "round-2", id: 8, name: "Round 2", shortLabel: "R2", entrantsLeft: 16 },
  { key: "quarterfinals", id: 13, name: "Quarterfinals", shortLabel: "QF", entrantsLeft: 8 },
  { key: "semifinals", id: 14, name: "Semifinals", shortLabel: "SF", entrantsLeft: 4 },
  { key: "final", id: 15, name: "Final", shortLabel: "F", entrantsLeft: 2 },
];
const ROUND_ONE_SIZE = 32;
const LIVE_TOURNAMENT_DATA = runtimeConfig.liveTournamentData;
const LIVE_SNAPSHOT_CACHE_TTL_SECONDS = 300;
const SEASON_EVENTS_CACHE_TTL_SECONDS = 86400;
const HEAD_TO_HEAD_CACHE_TTL_SECONDS = 86400;
const PUBLIC_SITE_PATHS = ["/", "/entrants", "/matches", "/bracket", "/winners"];

let sqliteCacheModulePromise = null;
let currentSiteSettings = { clacksNames: [] };

async function loadSqliteCacheModule() {
  if (!sqliteCacheModulePromise) {
    sqliteCacheModulePromise = import("./sqlite_cache.mjs").catch((error) => {
      console.warn("[sqlite_cache] unavailable:", error?.message || error);
      return null;
    });
  }

  return sqliteCacheModulePromise;
}

function playerLabel(player) {
  return (player.Name || `${player.FirstName ?? ""} ${player.LastName ?? ""}`).replace(/\s+/g, " ").trim();
}

function getRequestOrigin(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" && forwardedProto
    ? forwardedProto.split(",")[0].trim()
    : req.protocol;

  return `${protocol}://${req.get("host")}`;
}

function isPlaceholderEntrant(entry) {
  const name = String(entry?.name || "").trim();
  return !name || /^tbd$/i.test(name) || /^unknown$/i.test(String(entry?.nationality || "").trim());
}

function normaliseClacksName(value) {
  const nextValue = String(value || "").replace(/\s+/g, " ").trim();
  if (!nextValue) {
    return "";
  }

  return nextValue.slice(0, 120);
}

function normaliseSiteSettings(payload) {
  const uniqueNames = [];
  const seen = new Set();

  for (const value of Array.isArray(payload?.clacksNames) ? payload.clacksNames : []) {
    const name = normaliseClacksName(value);
    const dedupeKey = name.toLocaleLowerCase("en-GB");
    if (!name || seen.has(dedupeKey)) {
      continue;
    }
    uniqueNames.push(name);
    seen.add(dedupeKey);
  }

  return {
    clacksNames: uniqueNames,
  };
}

function formatClacksHeaderValue(names) {
  return names
    .map((value) => normaliseClacksName(value))
    .filter(Boolean)
    .map((name) => (/^GNU\s+/i.test(name) ? name : `GNU ${name}`))
    .join(", ");
}

async function loadCurrentSiteSettings() {
  currentSiteSettings = normaliseSiteSettings(await readSiteSettings());
  return currentSiteSettings;
}

async function fetchJson(url) {
  const headers = SN_REQUESTED_BY ? { "X-Requested-By": SN_REQUESTED_BY } : {};
  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Our live results supplier is receiving too many requests right now. Please try again in a few minutes.");
    }
    throw new Error(`snooker.org request failed (${response.status}).`);
  }

  return response.json();
}

async function resolveWorldChampionshipEventId(year) {
  if (WORLD_CHAMPIONSHIP_EVENT_IDS[year]) {
    return WORLD_CHAMPIONSHIP_EVENT_IDS[year];
  }

  const season = year - 1;
  const events = await fetchSeasonEvents(season);
  const event = events.find((item) => {
    const name = item.Name || item.Event || "";
    return /World Championship/i.test(name) && item.Stage === "F" && String(item.StartDate || "").startsWith(String(year));
  });

  if (!event?.ID) {
    throw new Error(`World Championship event id not found for ${year}`);
  }

  return Number(event.ID);
}

async function fetchSeasonEvents(season) {
  const sqliteCache = await loadSqliteCacheModule();
  const getCachedSeasonEvents = sqliteCache?.getCachedSeasonEvents;
  const cacheSeasonEvents = sqliteCache?.cacheSeasonEvents;
  const cached = getCachedSeasonEvents?.(season, SEASON_EVENTS_CACHE_TTL_SECONDS);
  if (cached?.length) {
    return cached;
  }

  const events = await fetchJson(`${SN_API}/?t=5&s=${season}&tr=main`);
  if (Array.isArray(events) && events.length) {
    cacheSeasonEvents?.(season, events);
  }
  return events;
}

function getSeasonStartYearForTournamentYear(year) {
  return Number(year) - 1;
}

function getSeasonLabel(seasonStartYear) {
  return `${seasonStartYear}/${seasonStartYear + 1}`;
}

async function fetchHeadToHead(player1Id, player2Id, year, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const season = getSeasonStartYearForTournamentYear(year);
  const orderedIds = [Number(player1Id), Number(player2Id)].sort((left, right) => left - right);
  const cacheKey = `${orderedIds[0]}:${orderedIds[1]}:${season}:main`;
  const sqliteCache = await loadSqliteCacheModule();
  const getCachedHeadToHead = sqliteCache?.getCachedHeadToHead;
  const cacheHeadToHead = sqliteCache?.cacheHeadToHead;
  const cached = !forceRefresh ? getCachedHeadToHead?.(cacheKey, HEAD_TO_HEAD_CACHE_TTL_SECONDS) : null;
  if (cached) {
    return cached;
  }

  const [matches, events] = await Promise.all([
    fetchJson(`${SN_API}/?p1=${player1Id}&p2=${player2Id}&s=${season}&tr=main`),
    fetchSeasonEvents(season),
  ]);

  const eventNamesById = new Map((events || []).map((event) => [
    Number(event.ID),
    String(event.Name || event.Event || "").trim(),
  ]));

  const formattedMatches = Array.isArray(matches)
    ? matches.map((match) => ({
      id: Number(match.ID),
      eventId: Number(match.EventID) || null,
      eventName: eventNamesById.get(Number(match.EventID)) || "Unknown event",
      round: Number(match.Round) || null,
      number: Number(match.Number) || null,
      score1: Number(match.Score1) || 0,
      score2: Number(match.Score2) || 0,
      player1Id: Number(match.Player1ID) || null,
      player2Id: Number(match.Player2ID) || null,
      winnerId: Number(match.WinnerID) || null,
      unfinished: Boolean(match.Unfinished),
      scheduledDate: match.ScheduledDate || "",
      startDate: match.StartDate || "",
      endDate: match.EndDate || "",
      note: match.Note || "",
      extendedNote: match.ExtendedNote || "",
      frameScores: match.FrameScores || "",
      detailsUrl: match.DetailsUrl || "",
      videoUrl: match.VideoURL || "",
    }))
    : [];

  const wins = {
    [player1Id]: formattedMatches.filter((match) => match.winnerId === player1Id).length,
    [player2Id]: formattedMatches.filter((match) => match.winnerId === player2Id).length,
  };

  const result = {
    season,
    seasonLabel: getSeasonLabel(season),
    matches: formattedMatches,
    summary: {
      totalMatches: formattedMatches.length,
      player1Wins: wins[player1Id],
      player2Wins: wins[player2Id],
    },
  };

  cacheHeadToHead?.(cacheKey, result);
  return result;
}

async function fetchLast32Players(year, eventId) {
  const sqliteCache = await loadSqliteCacheModule();
  const cacheEventPlayers = sqliteCache?.cacheEventPlayers;
  const cacheLast32 = sqliteCache?.cacheLast32;
  const getCachedEventPlayers = sqliteCache?.getCachedEventPlayers;
  const getCachedLast32 = sqliteCache?.getCachedLast32;

  try {
    const cachedEventPlayers = getCachedEventPlayers?.(year);
    const [allPlayers, rounds, matches] = await Promise.all([
      cachedEventPlayers?.length ? Promise.resolve(cachedEventPlayers) : fetchJson(`${SN_API}/?t=9&e=${eventId}`),
      fetchJson(`${SN_API}/?t=12&e=${eventId}`),
      fetchJson(`${SN_API}/?t=6&e=${eventId}`),
    ]);
    if (!cachedEventPlayers?.length && Array.isArray(allPlayers) && allPlayers.length >= ROUND_ONE_SIZE) {
      cacheEventPlayers?.(year, allPlayers);
    }

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
      cacheLast32?.(year, filtered);
    }
    return filtered;
  } catch (error) {
    const cachedEventPlayers = getCachedEventPlayers?.(year);
    if (cachedEventPlayers?.length) {
      const [rounds, matches] = await Promise.all([
        fetchJson(`${SN_API}/?t=12&e=${eventId}`),
        fetchJson(`${SN_API}/?t=6&e=${eventId}`),
      ]);
      const round = rounds.find((item) => Number(item.EventID) === eventId && Number(item.NumLeft) === ROUND_ONE_SIZE);
      if (round) {
        const ids = new Set();
        for (const match of matches) {
          if (String(match.Round) !== String(round.Round)) {
            continue;
          }
          ids.add(Number(match.Player1ID));
          ids.add(Number(match.Player2ID));
        }
        const filtered = cachedEventPlayers.filter((player) => ids.has(Number(player.ID)));
        if (filtered.length === ROUND_ONE_SIZE) {
          cacheLast32?.(year, filtered);
          return filtered;
        }
      }
    }

    const cached = getCachedLast32?.(year);
    if (cached?.length === ROUND_ONE_SIZE) {
      return cached;
    }
    throw error;
  }
}

function buildTournamentSnapshot({ year, eventId, players, matches, seedings }) {
  const playersById = new Map(
    players.map((player) => [
      Number(player.ID),
      {
        id: Number(player.ID),
        name: playerLabel(player),
        nationality: player.Nationality || "",
        photo: player.Photo || "",
        shortName: player.ShortName || "",
        born: player.Born || "",
        twitter: player.Twitter || "",
        websiteUrl: player.URL || "",
        info: player.Info || "",
        sex: player.Sex || "",
        photoSource: player.PhotoSource || "",
        firstSeasonAsPro: Number(player.FirstSeasonAsPro) || 0,
        lastSeasonAsPro: Number(player.LastSeasonAsPro) || 0,
        numRankingTitles: Number(player.NumRankingTitles) || 0,
        numMaximums: Number(player.NumMaximums) || 0,
      },
    ]),
  );
  const seedingById = new Map(seedings.map((item) => [Number(item.PlayerID), Number(item.Seeding)]));
  const entrantsById = new Map();
  const toMatchSide = (player, rawPlayerId, score, placeholderId) => {
    if (!player) {
      return {
        id: placeholderId,
        name: "TBD",
        nationality: "",
        photo: "",
        seedNumber: null,
        isSeed: false,
        score: Number(score) || 0,
      };
    }

    return {
      ...player,
      seedNumber: seedingById.get(player.id) ?? null,
      isSeed: (seedingById.get(player.id) ?? 99) <= 16,
      score: Number(score) || 0,
    };
  };

  const rounds = MAIN_DRAW_ROUNDS.map((round, index) => {
    const roundMatches = matches
      .filter((item) => Number(item.Round) === round.id)
      .sort((a, b) => Number(a.Number) - Number(b.Number))
      .map((match) => {
        const player1 = playersById.get(Number(match.Player1ID));
        const player2 = playersById.get(Number(match.Player2ID));

        const side1 = toMatchSide(player1, match.Player1ID, match.Score1, -((Number(match.ID) || 0) * 10 + 1));
        const side2 = toMatchSide(player2, match.Player2ID, match.Score2, -((Number(match.ID) || 0) * 10 + 2));
        const winnerId = Number(match.WinnerID) || null;
        const unfinished = Boolean(match.Unfinished) || !winnerId;
        const loserId = unfinished ? null : (winnerId === side1.id ? side2.id : side1.id);

        for (const side of [side1, side2]) {
          const existing = entrantsById.get(side.id) || side;
          entrantsById.set(side.id, {
            ...existing,
            ...side,
            eliminatedInRoundId: existing.eliminatedInRoundId ?? null,
          });
        }

        if (loserId !== null) {
          const loser = entrantsById.get(loserId);
          entrantsById.set(loserId, {
            ...loser,
            eliminatedInRoundId: round.id,
          });
        }

        return {
          id: Number(match.ID),
          number: Number(match.Number),
          scheduledDate: match.ScheduledDate || match.StartDate || "",
          startDate: match.StartDate || "",
          endDate: match.EndDate || "",
          tableNo: Number(match.TableNo) || 0,
          winnerId,
          loserId,
          unfinished,
          status: unfinished ? "in-play" : "finished",
          detailsUrl: match.DetailsUrl || "",
          liveUrl: match.LiveUrl || "",
          player1: side1,
          player2: side2,
        };
      });

    return {
      ...round,
      order: index + 1,
      matchCount: roundMatches.length,
      matches: roundMatches,
    };
  });

  const entrants = Array.from(entrantsById.values())
    .map((entry) => ({
      ...entry,
      isPlaceholder: isPlaceholderEntrant(entry),
      eliminatedInRoundId: entry.eliminatedInRoundId ?? null,
      isChampion: entry.eliminatedInRoundId === null,
    }))
    .sort((a, b) => {
      const seedA = a.seedNumber ?? 999;
      const seedB = b.seedNumber ?? 999;
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
    entrants,
    seeds: entrants.filter((entry) => entry.isSeed && !entry.isPlaceholder),
    qualifiers: entrants.filter((entry) => !entry.isSeed && !entry.isPlaceholder),
    rounds,
  };
}

function buildEmptyTournamentSnapshot(year, liveError = null) {
  return {
    year,
    eventId: null,
    eventName: `World Championship ${year}`,
    eventDates: {
      start: `${year}-04-19`,
      end: `${year}-05-05`,
    },
    entrants: [],
    seeds: [],
    qualifiers: [],
    rounds: MAIN_DRAW_ROUNDS.map((round, index) => ({
      ...round,
      order: index + 1,
      matchCount: 0,
      matches: [],
    })),
    dataSource: "unavailable",
    liveError,
  };
}

function mergeSnapshotMatchLinks(snapshot, fallbackSnapshot) {
  if (!snapshot?.rounds?.length || !fallbackSnapshot?.rounds?.length) {
    return snapshot;
  }

  const fallbackMatchByKey = new Map(
    fallbackSnapshot.rounds.flatMap((round) => (
      (round.matches || []).map((match) => [
        `${round.key}:${match.id || ""}:${match.number || ""}`,
        match,
      ])
    )),
  );

  return {
    ...snapshot,
    rounds: snapshot.rounds.map((round) => ({
      ...round,
      matches: (round.matches || []).map((match) => {
        const fallbackMatch = fallbackMatchByKey.get(`${round.key}:${match.id || ""}:${match.number || ""}`);
        if (!fallbackMatch) {
          return match;
        }

        return {
          ...match,
          detailsUrl: match.detailsUrl || fallbackMatch.detailsUrl || "",
          liveUrl: match.liveUrl || fallbackMatch.liveUrl || fallbackMatch.detailsUrl || "",
        };
      }),
    })),
  };
}

async function hydrateSnapshotMatchLinks(year, snapshot) {
  if (!snapshot?.rounds?.some((round) => (round.matches || []).some((match) => !match.detailsUrl && !match.liveUrl))) {
    return snapshot;
  }

  try {
    const fallbackSnapshot = await readStaticSnapshot(year);
    return mergeSnapshotMatchLinks(snapshot, fallbackSnapshot);
  } catch {
    return snapshot;
  }
}

async function buildLiveTournamentSnapshot(year) {
  const eventId = await resolveWorldChampionshipEventId(year);
  const [players, matches, seedings] = await Promise.all([
    fetchLast32Players(year, eventId),
    fetchJson(`${SN_API}/?t=6&e=${eventId}`),
    fetchJson(`${SN_API}/?t=13&e=${eventId}`),
  ]);

  return {
    ...buildTournamentSnapshot({ year, eventId, players, matches, seedings }),
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

async function writeStaticSnapshot(year, snapshot) {
  const filePath = getStaticSnapshotPath(year);
  const payload = {
    ...snapshot,
  };
  delete payload.dataSource;
  delete payload.liveError;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function getTournamentSnapshot(year, options = {}) {
  const forceRefresh = options.forceRefresh === true;
  const sqliteCache = await loadSqliteCacheModule();
  const getCachedTournamentSnapshot = sqliteCache?.getCachedTournamentSnapshot;
  const cacheTournamentSnapshot = sqliteCache?.cacheTournamentSnapshot;
  const playerOverrides = await readPlayerOverrides();

  if (!LIVE_TOURNAMENT_DATA) {
    try {
      const fallback = await readStaticSnapshot(year);
      return applyPlayerOverridesToSnapshot({
        ...fallback,
        dataSource: "static",
        liveError: null,
      }, playerOverrides);
    } catch (error) {
      return buildEmptyTournamentSnapshot(year, String(error.message || error));
    }
  }

  try {
    const cachedLiveSnapshot = !forceRefresh
      ? getCachedTournamentSnapshot?.(year, LIVE_SNAPSHOT_CACHE_TTL_SECONDS)
      : null;
    if (cachedLiveSnapshot) {
      const hydratedSnapshot = await hydrateSnapshotMatchLinks(year, cachedLiveSnapshot);
      return applyPlayerOverridesToSnapshot(hydratedSnapshot, playerOverrides);
    }

    const liveSnapshot = await buildLiveTournamentSnapshot(year);
    cacheTournamentSnapshot?.(year, liveSnapshot);
    try {
      await writeStaticSnapshot(year, liveSnapshot);
    } catch (writeError) {
      console.error("[writeStaticSnapshot] error:", writeError);
    }
    return applyPlayerOverridesToSnapshot(liveSnapshot, playerOverrides);
  } catch (error) {
    try {
      const fallback = await readStaticSnapshot(year);
      return applyPlayerOverridesToSnapshot({
        ...fallback,
        liveError: String(error.message || error),
      }, playerOverrides);
    } catch (fallbackError) {
      return buildEmptyTournamentSnapshot(
        year,
        String(error.message || error || fallbackError.message || fallbackError),
      );
    }
  }
}

function normaliseEntrantName(name, label = "Entrant name") {
  const trimmed = String(name || "").replace(/\s+/g, " ").trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function normaliseWinningYears(years, label = "Winning years") {
  if (years === undefined || years === null) {
    return [];
  }
  if (!Array.isArray(years)) {
    throw new Error(`${label} must be an array of years`);
  }

  const parsed = years.map((value) => Number(value));
  if (parsed.some((value) => !Number.isInteger(value))) {
    throw new Error(`${label} must contain whole years`);
  }
  if (new Set(parsed).size !== parsed.length) {
    throw new Error(`${label} contains duplicate years`);
  }

  return [...parsed].sort((left, right) => left - right);
}

function normalisePlayerOverrideText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalisePlayerOverrides(overrides) {
  if (!Array.isArray(overrides)) {
    throw new Error("Player overrides must be an array");
  }

  const seenIds = new Set();

  return overrides.flatMap((override, index) => {
    const playerId = Number(override?.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      throw new Error(`Player override ${index + 1} needs a valid player id`);
    }
    if (seenIds.has(playerId)) {
      throw new Error(`Duplicate player override found for player ${playerId}`);
    }
    seenIds.add(playerId);

    const entry = {
      playerId,
      nickname: normalisePlayerOverrideText(override?.nickname),
      nationality: normalisePlayerOverrideText(override?.nationality),
      born: normalisePlayerOverrideText(override?.born),
      photo: normalisePlayerOverrideText(override?.photo),
      twitter: normalisePlayerOverrideText(override?.twitter),
      websiteUrl: normalisePlayerOverrideText(override?.websiteUrl),
      info: normalisePlayerOverrideText(override?.info),
      photoSource: normalisePlayerOverrideText(override?.photoSource),
    };

    const hasOverride = Object.entries(entry).some(([key, value]) => key !== "playerId" && value);
    return hasOverride ? [entry] : [];
  });
}

function mergePlayerOverride(player, override) {
  if (!player || !override) {
    return player;
  }

  return {
    ...player,
    nickname: override.nickname || player.nickname || "",
    nationality: override.nationality || player.nationality || "",
    born: override.born || player.born || "",
    photo: override.photo || player.photo || "",
    twitter: override.twitter || player.twitter || "",
    websiteUrl: override.websiteUrl || player.websiteUrl || "",
    info: override.info || player.info || "",
    photoSource: override.photoSource || player.photoSource || "",
  };
}

function mergePlayerOverrideIntoMatchSide(side, entrantsById, overridesById) {
  const entrantVersion = entrantsById.get(Number(side?.id));
  if (entrantVersion) {
    return {
      ...entrantVersion,
      seedNumber: side.seedNumber ?? entrantVersion.seedNumber ?? null,
      isSeed: side.isSeed ?? entrantVersion.isSeed ?? false,
      score: Number(side.score) || 0,
    };
  }

  return mergePlayerOverride(side, overridesById.get(Number(side?.id)));
}

function applyPlayerOverridesToSnapshot(snapshot, playerOverrides) {
  if (!snapshot || !Array.isArray(snapshot.entrants)) {
    return snapshot;
  }

  const overridesById = new Map(playerOverrides.map((override) => [override.playerId, override]));
  if (!overridesById.size) {
    return snapshot;
  }

  const entrants = snapshot.entrants.map((entry) => mergePlayerOverride(entry, overridesById.get(Number(entry.id))));
  const entrantsById = new Map(entrants.map((entry) => [entry.id, entry]));

  return {
    ...snapshot,
    entrants,
    seeds: entrants.filter((entry) => entry.isSeed && !entry.isPlaceholder),
    qualifiers: entrants.filter((entry) => !entry.isSeed && !entry.isPlaceholder),
    rounds: (snapshot.rounds || []).map((round) => ({
      ...round,
      matches: (round.matches || []).map((match) => ({
        ...match,
        player1: mergePlayerOverrideIntoMatchSide(match.player1, entrantsById, overridesById),
        player2: mergePlayerOverrideIntoMatchSide(match.player2, entrantsById, overridesById),
      })),
    })),
  };
}

function normaliseEntrantRegistry(entrants) {
  if (!Array.isArray(entrants)) {
    throw new Error("Entrant registry must be an array");
  }

  const seenIds = new Set();
  const seenNames = new Set();
  const winningYearOwners = new Map();

  return entrants.map((entrant, index) => {
    const id = String(entrant?.id || randomUUID());
    const name = normaliseEntrantName(entrant?.name, `Entrant ${index + 1} name`);
    const winningYears = normaliseWinningYears(entrant?.winningYears, `${name} winningYears`);
    const lowerName = name.toLowerCase();

    if (seenIds.has(id)) {
      throw new Error(`Duplicate entrant id found for ${name}`);
    }
    if (seenNames.has(lowerName)) {
      throw new Error(`Duplicate entrant name found for ${name}`);
    }

    seenIds.add(id);
    seenNames.add(lowerName);

    for (const year of winningYears) {
      const existingOwner = winningYearOwners.get(year);
      if (existingOwner) {
        throw new Error(`${year} already has a winner assigned (${existingOwner})`);
      }
      winningYearOwners.set(year, name);
    }

    return { id, name, winningYears };
  });
}

function combineRegistryWithPoolData(registryEntrants, poolData) {
  const competitors = Array.isArray(poolData?.competitors) ? poolData.competitors : [];
  const registryById = new Map(registryEntrants.map((entrant) => [entrant.id, entrant]));
  const registryByName = new Map(registryEntrants.map((entrant) => [entrant.name.toLowerCase(), entrant]));
  return competitors.map((competitor) => {
    const entrantName = normaliseEntrantName(competitor?.name, "Entrant name");
    const matchedEntrant = competitor.entrantId
      ? registryById.get(String(competitor.entrantId))
      : registryByName.get(entrantName.toLowerCase());
    const entrantId = matchedEntrant?.id || String(competitor?.entrantId || randomUUID());

    return {
      entrantId,
      name: matchedEntrant?.name || entrantName,
      seedIds: Array.isArray(competitor?.seedIds) ? competitor.seedIds : [],
      qualifierIds: Array.isArray(competitor?.qualifierIds) ? competitor.qualifierIds : [],
    };
  });
}

function preparePoolPayload(year, eventName, competitors) {
  if (!Array.isArray(competitors)) {
    throw new Error("Competitors must be an array");
  }

  const seenEntrantIds = new Set();
  const seenNames = new Set();

  return {
    year,
    eventName,
    competitors: competitors.map((competitor, index) => {
      const entrantId = String(competitor?.entrantId || randomUUID());
      const name = normaliseEntrantName(competitor?.name, `Competitor ${index + 1} name`);
      const lowerName = name.toLowerCase();

      if (seenEntrantIds.has(entrantId)) {
        throw new Error(`Duplicate entrant id found for ${name}`);
      }
      if (seenNames.has(lowerName)) {
        throw new Error(`Duplicate entrant name found for ${name}`);
      }

      seenEntrantIds.add(entrantId);
      seenNames.add(lowerName);

      return {
        entrantId,
        name,
        seedIds: Array.isArray(competitor?.seedIds) ? competitor.seedIds : [],
        qualifierIds: Array.isArray(competitor?.qualifierIds) ? competitor.qualifierIds : [],
      };
    }),
  };
}

function normaliseIds(ids, allowed, label) {
  if (!Array.isArray(ids)) {
    throw new Error(`${label} must be an array of player ids`);
  }

  const parsed = ids.map((value) => Number(value));
  if (parsed.some((value) => Number.isNaN(value))) {
    throw new Error(`${label} contains a non-numeric player id`);
  }
  if (parsed.length > 8) {
    throw new Error(`${label} must contain at most 8 players`);
  }
  if (new Set(parsed).size !== parsed.length) {
    throw new Error(`${label} contains duplicate players`);
  }
  if (parsed.some((value) => !allowed.has(value))) {
    throw new Error(`${label} includes a player outside the 2025 main draw field`);
  }
  return parsed;
}

function buildPoolResponse(snapshot, poolData, filePath, entrantRegistry = []) {
  if (!Array.isArray(poolData?.competitors) || poolData.competitors.length === 0) {
    return {
      snapshot,
      competitors: [],
      sourceFile: filePath,
      poolConfigured: false,
    };
  }

  const entrantsById = new Map(snapshot.entrants.map((entry) => [entry.id, entry]));
  const validSeedIds = new Set(snapshot.seeds.map((entry) => entry.id));
  const validQualifierIds = new Set(snapshot.qualifiers.map((entry) => entry.id));
  const registryById = new Map(entrantRegistry.map((entrant) => [String(entrant.id), entrant]));
  const registryByName = new Map(entrantRegistry.map((entrant) => [entrant.name.toLowerCase(), entrant]));

  const competitors = poolData.competitors.map((competitor) => {
    if (!competitor?.name) {
      throw new Error("Each competitor needs a name");
    }

    const seedIds = normaliseIds(competitor.seedIds, validSeedIds, `${competitor.name} seedIds`);
    const qualifierIds = normaliseIds(competitor.qualifierIds, validQualifierIds, `${competitor.name} qualifierIds`);
    const registryEntrant = competitor.entrantId
      ? registryById.get(String(competitor.entrantId))
      : registryByName.get(String(competitor.name).toLowerCase());

    return {
      entrantId: competitor.entrantId ? String(competitor.entrantId) : null,
      name: competitor.name,
      winningYears: registryEntrant?.winningYears || [],
      seeds: seedIds.map((playerId) => entrantsById.get(playerId)),
      qualifiers: qualifierIds.map((playerId) => entrantsById.get(playerId)),
    };
  });

  return {
    snapshot,
    competitors,
    sourceFile: filePath,
    poolConfigured: true,
  };
}

function buildPublicPoolResponse(snapshot, poolData, filePath, entrantRegistry = []) {
  try {
    return buildPoolResponse(snapshot, poolData, filePath, entrantRegistry);
  } catch (error) {
    return {
      snapshot,
      competitors: [],
      sourceFile: filePath,
      poolConfigured: false,
      poolConfigError: String(error.message || error),
    };
  }
}

function getAdminYearOptions(baseYear) {
  return Array.from({ length: 6 }, (_, index) => baseYear - index).sort((left, right) => right - left);
}

function buildAdminPoolResponse(snapshot, poolData, filePath, entrantRegistry) {
  const currentYear = new Date().getFullYear();
  const selectedYear = Number(snapshot?.year ?? poolData?.year ?? currentYear);
  const minKnownYear = Math.min(...Object.keys(WORLD_CHAMPIONSHIP_EVENT_IDS).map((value) => Number(value)), selectedYear);
  const maxKnownYear = Math.max(currentYear, selectedYear);
  const availableYears = [];
  for (let year = maxKnownYear; year >= minKnownYear; year -= 1) {
    availableYears.push(year);
  }

  return {
    snapshot,
    entrantRegistry,
    availableYears: availableYears.length ? availableYears : getAdminYearOptions(currentYear),
    poolData: {
      year: poolData?.year ?? snapshot.year,
      eventName: poolData?.eventName ?? snapshot.eventName,
      competitors: combineRegistryWithPoolData(entrantRegistry, poolData),
    },
    sourceFile: filePath,
  };
}

function mergeRegistryWithCompetitors(existingRegistry, competitors) {
  const existingById = new Map(existingRegistry.map((entrant) => [entrant.id, entrant]));
  const merged = new Map(existingRegistry.map((entrant) => [entrant.id, entrant]));

  for (const competitor of competitors) {
    const existing = existingById.get(competitor.entrantId);
    merged.set(competitor.entrantId, {
      id: competitor.entrantId,
      name: competitor.name,
      winningYears: existing?.winningYears || [],
    });
  }

  return Array.from(merged.values());
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    environment: runtimeConfig.appEnvironment,
    isRailway: runtimeConfig.isRailway,
    liveTournamentData: LIVE_TOURNAMENT_DATA,
    dataDirectory: runtimeConfig.mutableDataDir,
  });
});

app.get("/api/world-championship/:year", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const forceRefresh = String(req.query.refresh || "").trim() === "1";
    const snapshot = await getTournamentSnapshot(year, { forceRefresh });
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/world-championship/:year/round-one", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const forceRefresh = String(req.query.refresh || "").trim() === "1";
    const snapshot = await getTournamentSnapshot(year, { forceRefresh });
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/head-to-head", async (req, res) => {
  try {
    const player1Id = Number(req.query.p1);
    const player2Id = Number(req.query.p2);
    const year = Number(req.query.year);
    const forceRefresh = String(req.query.refresh || "").trim() === "1";

    if (!Number.isInteger(player1Id) || player1Id <= 0 || !Number.isInteger(player2Id) || player2Id <= 0) {
      return res.status(400).json({ error: "Both player ids are required." });
    }

    if (!Number.isInteger(year) || year <= 0) {
      return res.status(400).json({ error: "A valid tournament year is required." });
    }

    const headToHead = await fetchHeadToHead(player1Id, player2Id, year, { forceRefresh });
    res.json(headToHead);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/pool/:year", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const forceRefresh = String(req.query.refresh || "").trim() === "1";
    const [snapshot, poolFile, entrantRegistry] = await Promise.all([
      getTournamentSnapshot(year, { forceRefresh }),
      readPoolFileOptional(year),
      readEntrantRegistry(),
    ]);
    res.json(buildPublicPoolResponse(snapshot, poolFile.data, poolFile.filePath, entrantRegistry));
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post("/api/pool/:year/upload", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const snapshot = await getTournamentSnapshot(year);
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

app.get("/api/pool/:year/admin", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const [snapshot, poolFile, entrantRegistry] = await Promise.all([
      getTournamentSnapshot(year),
      readPoolFileOptional(year),
      readEntrantRegistry(),
    ]);
    res.json(buildAdminPoolResponse(snapshot, poolFile.data, poolFile.filePath, entrantRegistry));
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/entrants", async (_req, res) => {
  try {
    const entrantRegistry = await readEntrantRegistry();
    res.json({ entrants: normaliseEntrantRegistry(entrantRegistry) });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/player-overrides", async (_req, res) => {
  try {
    const overrides = await readPlayerOverrides();
    res.json({ overrides: normalisePlayerOverrides(overrides) });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/site-settings", async (_req, res) => {
  try {
    const settings = normaliseSiteSettings(await readSiteSettings());
    currentSiteSettings = settings;
    res.json({
      ...settings,
      clacksHeaderPreview: formatClacksHeaderValue(settings.clacksNames),
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.put("/api/entrants", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Entrant save body must be JSON" });
    }

    const entrantRegistry = normaliseEntrantRegistry(payload.entrants || []);
    await writeEntrantRegistry(entrantRegistry);
    res.json({ entrants: entrantRegistry });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.put("/api/player-overrides", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Player overrides save body must be JSON" });
    }

    const overrides = normalisePlayerOverrides(payload.overrides || []);
    await writePlayerOverrides(overrides);
    res.json({ overrides });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.put("/api/site-settings", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Site settings save body must be JSON" });
    }

    const settings = normaliseSiteSettings(payload);
    await writeSiteSettings(settings);
    currentSiteSettings = settings;
    res.json({
      ...settings,
      clacksHeaderPreview: formatClacksHeaderValue(settings.clacksNames),
    });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.put("/api/player-overrides/:playerId", async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    const payload = req.body;

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ error: "Player id must be a valid number" });
    }

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Player override save body must be JSON" });
    }

    const existingOverrides = normalisePlayerOverrides(await readPlayerOverrides());
    const nextOverrides = existingOverrides.filter((override) => Number(override.playerId) !== playerId);
    const candidate = normalisePlayerOverrides([{ ...payload, playerId }])[0];

    if (candidate) {
      nextOverrides.push(candidate);
      nextOverrides.sort((left, right) => left.playerId - right.playerId);
    }

    await writePlayerOverrides(nextOverrides);
    res.json({
      override: candidate || null,
      overrides: nextOverrides,
    });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.delete("/api/player-overrides/:playerId", async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);

    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ error: "Player id must be a valid number" });
    }

    const existingOverrides = normalisePlayerOverrides(await readPlayerOverrides());
    const nextOverrides = existingOverrides.filter((override) => Number(override.playerId) !== playerId);
    await writePlayerOverrides(nextOverrides);
    res.json({ overrides: nextOverrides });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.put("/api/pool/:year/admin", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const snapshot = await getTournamentSnapshot(year);
    const existingRegistry = await readEntrantRegistry();
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Save body must be JSON" });
    }

    const preparedPayload = preparePoolPayload(
      year,
      payload.eventName ?? `World Championship ${year}`,
      payload.competitors || [],
    );
    const entrantRegistry = normaliseEntrantRegistry(
      mergeRegistryWithCompetitors(existingRegistry, preparedPayload.competitors),
    );
    const filePath = await writePoolFile(year, preparedPayload);
    buildPoolResponse(snapshot, preparedPayload, filePath);
    await writeEntrantRegistry(entrantRegistry);
    res.json(buildAdminPoolResponse(snapshot, preparedPayload, filePath, entrantRegistry));
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

if (existsSync(CLIENT_DIST_DIR)) {
  app.get("/robots.txt", (req, res) => {
    const origin = getRequestOrigin(req);
    res.type("text/plain").send([
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin/login",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n"));
  });

  app.get("/sitemap.xml", (req, res) => {
    const origin = getRequestOrigin(req);
    const now = new Date().toISOString();
    const urls = PUBLIC_SITE_PATHS.map((routePath) => {
      const loc = new URL(routePath, `${origin}/`).toString();
      return [
        "  <url>",
        `    <loc>${loc}</loc>`,
        `    <lastmod>${now}</lastmod>`,
        "    <changefreq>daily</changefreq>",
        routePath === "/" ? "    <priority>1.0</priority>" : "    <priority>0.8</priority>",
        "  </url>",
      ].join("\n");
    }).join("\n");

    res.type("application/xml").send([
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
      urls,
      "</urlset>",
      "",
    ].join("\n"));
  });

  app.use(express.static(CLIENT_DIST_DIR));

  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
  });
}

export default app;

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  app.listen(PORT, () => {
    console.log(`Snooker pool server listening on http://localhost:${PORT}`);
    console.log(`Application environment: ${runtimeConfig.appEnvironment}`);
    console.log(`Running on Railway: ${runtimeConfig.isRailway ? "yes" : "no"}`);
    console.log(`snooker.org live mode ${LIVE_TOURNAMENT_DATA ? "enabled" : "disabled"} using X-Requested-By: ${SN_REQUESTED_BY}`);
    console.log(`Mutable pool data directory: ${runtimeConfig.mutableDataDir}`);
  });
}
