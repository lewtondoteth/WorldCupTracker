import fetch from "node-fetch";
import { buildStaticHeadToHead, buildStaticWorldCupSnapshot, buildUpcomingWorldCupSnapshot } from "./world-cup-data.mjs";
import { readTournamentLiveCache, writeTournamentLiveCache } from "./storage.mjs";

const WORLD_CUP_CODE = "WC";
const DEFAULT_BASE_URL = "https://api.football-data.org/v4";
const HISTORY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CURRENT_MATCHES_CACHE_TTL_MS = 15 * 60 * 1000;
const CURRENT_STANDINGS_CACHE_TTL_MS = 15 * 60 * 1000;
const CURRENT_TEAMS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_FALLBACK_TTL_MS = 60 * 1000;
const RESOURCE_ORDER = ["teams", "standings", "matches"];
const RESOURCE_TTL_BY_KEY = {
  teams: CURRENT_TEAMS_CACHE_TTL_MS,
  standings: CURRENT_STANDINGS_CACHE_TTL_MS,
  matches: CURRENT_MATCHES_CACHE_TTL_MS,
};

function mapStage(stage) {
  const map = {
    GROUP_STAGE: { key: "group-stage", name: "Group Stage", shortLabel: "GS", order: 1 },
    LAST_16: { key: "round-of-16", name: "Round of 16", shortLabel: "R16", order: 2 },
    QUARTER_FINALS: { key: "quarterfinals", name: "Quarter-finals", shortLabel: "QF", order: 3 },
    SEMI_FINALS: { key: "semifinals", name: "Semi-finals", shortLabel: "SF", order: 4 },
    THIRD_PLACE: { key: "third-place", name: "Third-place Play-off", shortLabel: "3P", order: 5 },
    FINAL: { key: "final", name: "Final", shortLabel: "F", order: 6 },
  };

  return map[stage] || { key: String(stage || "other").toLowerCase(), name: String(stage || "Other"), shortLabel: "OT", order: 99 };
}

function groupCodeToLetter(group) {
  const match = String(group || "").match(/^GROUP_([A-Z])$/);
  return match ? match[1] : "";
}

function normaliseDateValue(value) {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
}

function isoNow() {
  return new Date().toISOString();
}

function scoreValue(scoreNode, side) {
  if (!scoreNode || typeof scoreNode !== "object") {
    return 0;
  }
  return Number(scoreNode?.[side] ?? scoreNode?.[`${side}Team`] ?? 0) || 0;
}

function mapWinnerId(match) {
  const winner = match?.score?.winner;
  if (winner === "HOME_TEAM") {
    return Number(match?.homeTeam?.id) || null;
  }
  if (winner === "AWAY_TEAM") {
    return Number(match?.awayTeam?.id) || null;
  }
  return null;
}

function buildResultMetadata(match) {
  const winnerId = mapWinnerId(match);
  const decisionDuration = String(match?.score?.duration || "").toUpperCase();
  const decisionMethod = decisionDuration === "PENALTY_SHOOTOUT"
    ? "penalties"
    : decisionDuration === "EXTRA_TIME"
      ? "extra-time"
      : winnerId
        ? "regulation"
        : "draw";
  let note = "";
  let penaltyScore = null;

  if (decisionMethod === "penalties") {
    const homePens = scoreValue(match?.score?.penalties, "home");
    const awayPens = scoreValue(match?.score?.penalties, "away");
    const winner = winnerId === Number(match?.homeTeam?.id) ? match?.homeTeam : match?.awayTeam;
    const winnerPens = winnerId === Number(match?.homeTeam?.id) ? homePens : awayPens;
    const loserPens = winnerId === Number(match?.homeTeam?.id) ? awayPens : homePens;
    penaltyScore = { home: homePens, away: awayPens };
    note = `${winner?.shortName || winner?.name || "Winner"} won ${winnerPens}-${loserPens} on penalties.`;
  } else if (decisionMethod === "extra-time") {
    note = "Decided after extra time.";
  }

  return {
    winnerId,
    decisionMethod,
    penaltyScore,
    note,
  };
}

function mapTeam(team, standingsByTeamId, extra = {}) {
  const standing = standingsByTeamId.get(Number(team?.id)) || null;
  const area = team?.area || {};
  return {
    id: Number(team?.id),
    name: team?.name || team?.shortName || "Unknown team",
    nationality: area.name || team?.name || "",
    photo: team?.crest || area.flag || "",
    shortName: team?.shortName || team?.tla || team?.name || "",
    nickname: team?.tla || "",
    born: team?.founded ? `${team.founded}-01-01` : "",
    twitter: "",
    websiteUrl: team?.website || "",
    info: team?.venue ? `Home venue: ${team.venue}.` : "",
    photoSource: "football-data.org",
    firstSeasonAsPro: 0,
    lastSeasonAsPro: 0,
    numRankingTitles: 0,
    numMaximums: 0,
    confederation: area.parentArea || area.name || "",
    group: standing?.group || "",
    ...extra,
  };
}

function mapMatch(match, standingsByTeamId) {
  const stageMeta = mapStage(match?.stage);
  const homeScore = scoreValue(match?.score?.fullTime, "home");
  const awayScore = scoreValue(match?.score?.fullTime, "away");
  const result = buildResultMetadata(match);

  return {
    id: Number(match?.id),
    group: groupCodeToLetter(match?.group),
    number: Number(match?.matchday) || Number(match?.id),
    scheduledDate: normaliseDateValue(match?.utcDate),
    startDate: normaliseDateValue(match?.utcDate),
    endDate: normaliseDateValue(match?.utcDate),
    tableNo: 0,
    winnerId: result.winnerId,
    unfinished: !["FINISHED", "AWARDED"].includes(String(match?.status || "")),
    note: result.note,
    decisionMethod: result.decisionMethod,
    penaltyScore: result.penaltyScore,
    detailsUrl: "",
    liveUrl: "",
    player1: {
      ...mapTeam(match?.homeTeam, standingsByTeamId),
      score: homeScore,
      isPlaceholder: false,
    },
    player2: {
      ...mapTeam(match?.awayTeam, standingsByTeamId),
      score: awayScore,
      isPlaceholder: false,
    },
    stageKey: stageMeta.key,
  };
}

function buildStandingsIndex(standingsResponse) {
  const standingsByTeamId = new Map();

  for (const standing of standingsResponse?.standings || []) {
    const group = groupCodeToLetter(standing?.group);
    for (const row of standing?.table || []) {
      standingsByTeamId.set(Number(row?.team?.id), {
        group,
        position: Number(row?.position) || null,
        points: Number(row?.points) || 0,
        playedGames: Number(row?.playedGames) || 0,
        won: Number(row?.won) || 0,
        drawn: Number(row?.draw) || 0,
        lost: Number(row?.lost) || 0,
        goalsFor: Number(row?.goalsFor) || 0,
        goalsAgainst: Number(row?.goalsAgainst) || 0,
        goalDifference: Number(row?.goalDifference) || 0,
      });
    }
  }

  return standingsByTeamId;
}

function buildGroups(standingsResponse, matchesResponse, standingsByTeamId) {
  const matches = matchesResponse?.matches || [];

  return (standingsResponse?.standings || []).map((standing) => {
    const group = groupCodeToLetter(standing?.group);
    return {
      key: group,
      name: `Group ${group}`,
      standings: (standing?.table || []).map((row) => ({
        position: Number(row?.position) || 0,
        team: mapTeam(row?.team, standingsByTeamId),
        played: Number(row?.playedGames) || 0,
        won: Number(row?.won) || 0,
        drawn: Number(row?.draw) || 0,
        lost: Number(row?.lost) || 0,
        goalsFor: Number(row?.goalsFor) || 0,
        goalsAgainst: Number(row?.goalsAgainst) || 0,
        goalDifference: Number(row?.goalDifference) || 0,
        points: Number(row?.points) || 0,
      })),
      fixtures: matches
        .filter((match) => groupCodeToLetter(match?.group) === group)
        .map((match) => mapMatch(match, standingsByTeamId)),
    };
  });
}

function buildFixtureStages(matchesResponse, standingsByTeamId) {
  const grouped = new Map();

  for (const match of matchesResponse?.matches || []) {
    const stageMeta = mapStage(match?.stage);
    const bucket = grouped.get(stageMeta.key) || {
      id: 200 + stageMeta.order,
      key: stageMeta.key,
      name: stageMeta.name,
      shortLabel: stageMeta.shortLabel,
      order: stageMeta.order,
      matchCount: 0,
      matches: [],
    };
    bucket.matches.push(mapMatch(match, standingsByTeamId));
    bucket.matchCount = bucket.matches.length;
    grouped.set(stageMeta.key, bucket);
  }

  return [...grouped.values()].sort((left, right) => left.order - right.order);
}

function buildKnockoutSnapshot(fixtureStages) {
  return fixtureStages
    .filter((stage) => ["round-of-16", "quarterfinals", "semifinals", "final"].includes(stage.key))
    .map((stage, index) => ({
      id: 100 + index + 1,
      key: stage.key,
      name: stage.name,
      shortLabel: stage.shortLabel,
      entrantsLeft: Math.max(stage.matches.length * 2, 2),
      order: index + 1,
      matchCount: stage.matches.length,
      matches: stage.matches,
    }));
}

function buildQualifiedEntrants(groups, rounds) {
  const qualificationRows = groups.flatMap((group) => group.standings.slice(0, 2));
  const matchList = rounds.flatMap((round) => round.matches.map((match) => ({ ...match, roundId: round.id, roundKey: round.key })));
  const entrants = [];

  for (const row of qualificationRows) {
    const teamId = row.team.id;
    const elimination = matchList.find((match) => (
      [match.player1.id, match.player2.id].includes(teamId) && match.winnerId && match.winnerId !== teamId
    )) || null;

    entrants.push({
      ...row.team,
      seedNumber: row.position,
      isSeed: row.position === 1,
      score: 0,
      eliminatedInRoundId: elimination ? elimination.roundId : null,
      isPlaceholder: false,
      isChampion: rounds.some((round) => round.key === "final" && round.matches.some((match) => match.winnerId === teamId)),
    });
  }

  return entrants;
}

function sortIsoDates(values) {
  return values
    .map((value) => normaliseDateValue(value))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function buildEventDates(matchesResponse) {
  const dates = sortIsoDates((matchesResponse?.matches || []).map((match) => match?.utcDate));
  return {
    start: dates[0] || "",
    end: dates[dates.length - 1] || "",
  };
}

function buildSnapshotFromResources(year, resources) {
  const standingsData = resources.standings?.data;
  const matchesData = resources.matches?.data;
  const teamsData = resources.teams?.data;

  if (!standingsData || !matchesData || !teamsData) {
    return null;
  }

  const standingsByTeamId = buildStandingsIndex(standingsData);
  const groups = buildGroups(standingsData, matchesData, standingsByTeamId);
  const fixtureStages = buildFixtureStages(matchesData, standingsByTeamId);
  const rounds = buildKnockoutSnapshot(fixtureStages);
  const entrants = buildQualifiedEntrants(groups, rounds);
  const allTeams = (teamsData?.teams || []).map((team) => mapTeam(team, standingsByTeamId));
  const finalStage = fixtureStages.find((stage) => stage.key === "final");
  const winnerTeamId = Number(finalStage?.matches?.[0]?.winnerId) || null;

  return {
    year,
    eventId: 2000,
    eventName: `FIFA World Cup ${year}`,
    eventDates: buildEventDates(matchesData),
    sampleDataYear: year,
    dataSourceMode: "live",
    dataSourceLabel: "football-data.org cached data",
    dataSourceUrl: "https://www.football-data.org/documentation/quickstart/",
    apiVersion: resources.matches?.meta?.apiVersion || resources.standings?.meta?.apiVersion || resources.teams?.meta?.apiVersion || "",
    entrants: entrants.map((entry) => ({
      ...entry,
      isChampion: winnerTeamId ? entry.id === winnerTeamId : entry.isChampion,
    })),
    seeds: entrants.filter((entry) => entry.isSeed),
    qualifiers: entrants.filter((entry) => !entry.isSeed),
    allTeams,
    groups,
    fixtureStages,
    rounds,
  };
}

function parseTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isHistoricalSeason(year) {
  return Number(year) < new Date().getUTCFullYear();
}

function getResourceTtlMs(resourceKey, year) {
  return isHistoricalSeason(year) ? HISTORY_CACHE_TTL_MS : (RESOURCE_TTL_BY_KEY[resourceKey] || CURRENT_MATCHES_CACHE_TTL_MS);
}

function isResourceFresh(resource, ttlMs) {
  if (!resource?.updatedAt || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return false;
  }
  return (Date.now() - parseTimestamp(resource.updatedAt)) <= ttlMs;
}

function cloneFallbackSnapshot(snapshot, cache) {
  return {
    ...snapshot,
    cache: cache || null,
  };
}

function createEmptyCacheRecord(year) {
  const resources = Object.fromEntries(RESOURCE_ORDER.map((key) => [key, {
    key,
    status: "idle",
    updatedAt: "",
    lastAttemptAt: "",
    error: "",
    data: null,
    meta: {},
  }]));

  return {
    year,
    snapshot: null,
    snapshotUpdatedAt: "",
    resources,
    rateLimit: {
      blockedUntil: 0,
      requestsAvailable: null,
      resetInSeconds: null,
    },
    refreshState: "idle",
    lastError: "",
  };
}

async function readResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { text, data };
}

function listCompletedResources(record) {
  return RESOURCE_ORDER.filter((key) => Boolean(record?.resources?.[key]?.data));
}

function listPendingResources(record, year) {
  return RESOURCE_ORDER.filter((key) => !isResourceFresh(record?.resources?.[key], getResourceTtlMs(key, year)));
}

function decorateSnapshot(snapshot, record) {
  const cache = {
    lastUpdatedAt: record.snapshotUpdatedAt || "",
    refreshState: record.refreshState,
    completedResources: listCompletedResources(record),
    pendingResources: listPendingResources(record, snapshot.year),
    blockedUntil: record.rateLimit?.blockedUntil || 0,
    requestsAvailable: record.rateLimit?.requestsAvailable ?? null,
    resetInSeconds: record.rateLimit?.resetInSeconds ?? null,
    lastError: record.lastError || "",
  };

  return {
    ...snapshot,
    cache,
  };
}

function getAllMatchesFromSnapshot(snapshot) {
  if (snapshot?.fixtureStages?.length) {
    return snapshot.fixtureStages.flatMap((stage) => stage.matches || []);
  }
  return snapshot?.rounds?.flatMap((round) => round.matches || []) || [];
}

export function createFootballDataProvider({ baseUrl, apiKey, fallbackSnapshotBuilder = buildStaticWorldCupSnapshot, upcomingSnapshotBuilder = buildUpcomingWorldCupSnapshot }) {
  const apiBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  let blockedUntil = 0;
  let lastFailureFallback = null;

  async function persistRecord(record) {
    await writeTournamentLiveCache(record.year, record);
    return record;
  }

  async function loadRecord(year) {
    const existing = await readTournamentLiveCache(year);
    const record = existing.data ? {
      ...createEmptyCacheRecord(year),
      ...existing.data,
      resources: {
        ...createEmptyCacheRecord(year).resources,
        ...(existing.data?.resources || {}),
      },
      rateLimit: {
        ...createEmptyCacheRecord(year).rateLimit,
        ...(existing.data?.rateLimit || {}),
      },
    } : createEmptyCacheRecord(year);

    blockedUntil = Math.max(blockedUntil, Number(record.rateLimit?.blockedUntil) || 0);
    return record;
  }

  async function fetchJson(path, record) {
    const effectiveBlockedUntil = Math.max(blockedUntil, Number(record.rateLimit?.blockedUntil) || 0);
    if (Date.now() < effectiveBlockedUntil) {
      const waitSeconds = Math.ceil((effectiveBlockedUntil - Date.now()) / 1000);
      const error = new Error(`football-data cooldown active. Wait ${waitSeconds} seconds.`);
      error.status = 429;
      error.resetInSeconds = waitSeconds;
      throw error;
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: {
        "X-Auth-Token": apiKey,
      },
    });
    const { data, text } = await readResponse(response);
    const requestsAvailable = Number(response.headers.get("x-requestsavailable"));
    const resetInSeconds = Number(response.headers.get("x-requestcounter-reset"));

    if (Number.isFinite(requestsAvailable) && requestsAvailable <= 2) {
      console.warn(`[football-data] low remaining requests: ${requestsAvailable}. Reset in ${resetInSeconds || 0}s.`);
      if (requestsAvailable <= 0 && Number.isFinite(resetInSeconds) && resetInSeconds > 0) {
        blockedUntil = Date.now() + (resetInSeconds * 1000);
      }
    }

    record.rateLimit = {
      blockedUntil,
      requestsAvailable: Number.isFinite(requestsAvailable) ? requestsAvailable : null,
      resetInSeconds: Number.isFinite(resetInSeconds) ? resetInSeconds : null,
    };

    if (!response.ok) {
      const message = data?.message || data?.error || text || `football-data request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.requestsAvailable = requestsAvailable;
      error.resetInSeconds = resetInSeconds;
      if (response.status === 429 && Number.isFinite(resetInSeconds) && resetInSeconds > 0) {
        blockedUntil = Date.now() + (resetInSeconds * 1000);
        record.rateLimit.blockedUntil = blockedUntil;
      }
      throw error;
    }

    return {
      data,
      meta: {
        requestsAvailable: Number.isFinite(requestsAvailable) ? requestsAvailable : null,
        resetInSeconds: Number.isFinite(resetInSeconds) ? resetInSeconds : null,
        apiVersion: response.headers.get("x-api-version") || "",
      },
    };
  }

  function getResourcePath(resourceKey, year) {
    if (resourceKey === "teams") {
      return `/competitions/${WORLD_CUP_CODE}/teams?season=${year}`;
    }
    if (resourceKey === "standings") {
      return `/competitions/${WORLD_CUP_CODE}/standings?season=${year}`;
    }
    return `/competitions/${WORLD_CUP_CODE}/matches?season=${year}`;
  }

  async function refreshResource(record, resourceKey, year) {
    const now = isoNow();
    const currentResource = record.resources[resourceKey] || createEmptyCacheRecord(year).resources[resourceKey];
    record.resources[resourceKey] = {
      ...currentResource,
      status: "loading",
      lastAttemptAt: now,
      error: "",
    };
    await persistRecord(record);

    try {
      const response = await fetchJson(getResourcePath(resourceKey, year), record);
      record.resources[resourceKey] = {
        key: resourceKey,
        status: "ready",
        updatedAt: isoNow(),
        lastAttemptAt: now,
        error: "",
        data: response.data,
        meta: response.meta,
      };
      record.lastError = "";
      return true;
    } catch (error) {
      record.resources[resourceKey] = {
        ...currentResource,
        status: "error",
        lastAttemptAt: now,
        error: String(error?.message || error),
      };
      record.lastError = String(error?.message || error);
      return false;
    } finally {
      await persistRecord(record);
    }
  }

  async function ensureSnapshotRecord(year, options = {}) {
    const season = Number(year);
    const forceRefresh = Boolean(options.forceRefresh);
    const record = await loadRecord(season);
    const pendingResources = forceRefresh
      ? RESOURCE_ORDER
      : listPendingResources(record, season);

    if (isHistoricalSeason(season) && record.snapshot && !forceRefresh) {
      record.refreshState = "ready";
      await persistRecord(record);
      return record;
    }

    if (!pendingResources.length && record.snapshot) {
      record.refreshState = "ready";
      await persistRecord(record);
      return record;
    }

    record.refreshState = "refreshing";
    await persistRecord(record);

    for (const resourceKey of pendingResources) {
      const refreshed = await refreshResource(record, resourceKey, season);
      if (!refreshed) {
        break;
      }
    }

    const nextSnapshot = buildSnapshotFromResources(season, record.resources);
    if (nextSnapshot) {
      record.snapshot = nextSnapshot;
      record.snapshotUpdatedAt = isoNow();
      record.refreshState = "ready";
      record.lastError = "";
    } else if (record.snapshot) {
      record.refreshState = record.lastError ? "partial" : "ready";
    } else {
      record.refreshState = "partial";
    }

    await persistRecord(record);
    return record;
  }

  return {
    key: "football-data.org",
    async getSnapshot(year, options = {}) {
      if (Number(year) !== 2022) {
        return upcomingSnapshotBuilder(year);
      }

      if (lastFailureFallback && Date.now() < lastFailureFallback.expiresAt && !options.forceRefresh) {
        return lastFailureFallback.snapshot;
      }

      try {
        const record = await ensureSnapshotRecord(year, options);
        if (record.snapshot) {
          const decorated = decorateSnapshot(record.snapshot, record);
          lastFailureFallback = null;
          return decorated;
        }
        throw new Error(record.lastError || "No complete live snapshot is cached yet.");
      } catch (error) {
        console.warn(`[football-data] snapshot fallback for ${year}:`, error?.message || error);
        const record = await loadRecord(year);
        const fallback = Number(year) === 2022
          ? fallbackSnapshotBuilder(year)
          : upcomingSnapshotBuilder(year);
        const fallbackSnapshot = decorateSnapshot({
          ...fallback,
          dataSourceMode: Number(year) === 2022 ? "fallback-static" : fallback.dataSourceMode,
          dataSourceLabel: Number(year) === 2022 ? "Static fallback after football-data.org error" : fallback.dataSourceLabel,
        }, record);
        lastFailureFallback = {
          snapshot: fallbackSnapshot,
          expiresAt: Date.now() + ((error?.status === 429 ? Math.max((error.resetInSeconds || 0) * 1000, RATE_LIMIT_FALLBACK_TTL_MS) : RATE_LIMIT_FALLBACK_TTL_MS)),
        };
        return cloneFallbackSnapshot(fallbackSnapshot, fallbackSnapshot.cache);
      }
    },
    async getHeadToHead(player1Id, player2Id, year, options = {}) {
      const snapshot = await this.getSnapshot(year, options);
      const allMatches = getAllMatchesFromSnapshot(snapshot);
      const orderedIds = [Number(player1Id), Number(player2Id)].sort((left, right) => left - right);
      const matches = allMatches
        .filter((match) => {
          const ids = [Number(match.player1?.id), Number(match.player2?.id)].sort((left, right) => left - right);
          return ids[0] === orderedIds[0] && ids[1] === orderedIds[1];
        })
        .map((match) => ({
          id: match.id,
          eventName: snapshot.eventName,
          scheduledDate: match.scheduledDate,
          score1: Number(match.player1?.score) || 0,
          score2: Number(match.player2?.score) || 0,
          player1Id: Number(match.player1?.id) || null,
          player2Id: Number(match.player2?.id) || null,
          winnerId: Number(match.winnerId) || null,
          note: match.note || "",
        }));

      if (!matches.length) {
        return buildStaticHeadToHead(player1Id, player2Id);
      }

      return {
        competitionLabel: snapshot.eventName,
        matches,
        summary: {
          totalMatches: matches.length,
          player1Wins: matches.filter((match) => match.winnerId === Number(player1Id)).length,
          player2Wins: matches.filter((match) => match.winnerId === Number(player2Id)).length,
        },
      };
    },
  };
}
