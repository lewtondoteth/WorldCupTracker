import fetch from "node-fetch";
import { buildStaticHeadToHead, buildStaticWorldCupSnapshot, buildUpcomingWorldCupSnapshot } from "./world-cup-data.mjs";

const WORLD_CUP_CODE = "WC";
const DEFAULT_BASE_URL = "https://api.football-data.org/v4";
const SNAPSHOT_CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_FALLBACK_TTL_MS = 60 * 1000;

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

function mapMatch(match, standingsByTeamId) {
  const stageMeta = mapStage(match?.stage);
  const homeScore = scoreValue(match?.score?.fullTime, "home");
  const awayScore = scoreValue(match?.score?.fullTime, "away");
  const noteParts = [];

  if (match?.score?.duration === "PENALTY_SHOOTOUT") {
    const homePens = scoreValue(match?.score?.penalties, "home");
    const awayPens = scoreValue(match?.score?.penalties, "away");
    noteParts.push(`Won ${homePens}-${awayPens} on penalties.`);
  } else if (match?.score?.duration === "EXTRA_TIME") {
    noteParts.push("Decided after extra time.");
  }

  return {
    id: Number(match?.id),
    group: groupCodeToLetter(match?.group),
    number: Number(match?.matchday) || Number(match?.id),
    scheduledDate: normaliseDateValue(match?.utcDate),
    startDate: normaliseDateValue(match?.utcDate),
    endDate: normaliseDateValue(match?.utcDate),
    tableNo: 0,
    winnerId: mapWinnerId(match),
    unfinished: !["FINISHED", "AWARDED"].includes(String(match?.status || "")),
    note: noteParts.join(" "),
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
  const knockoutStages = fixtureStages
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

  return knockoutStages;
}

function buildQualifiedEntrants(groups, rounds) {
  const roundIdByKey = new Map(rounds.map((round) => [round.key, round.id]));
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

export function createFootballDataProvider({ baseUrl, apiKey, fallbackSnapshotBuilder = buildStaticWorldCupSnapshot, upcomingSnapshotBuilder = buildUpcomingWorldCupSnapshot }) {
  const apiBaseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  const snapshotCache = new Map();
  let blockedUntil = 0;
  let lastFailureFallback = null;

  async function fetchJson(path) {
    if (Date.now() < blockedUntil) {
      const waitSeconds = Math.ceil((blockedUntil - Date.now()) / 1000);
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

    if (!response.ok) {
      const message = data?.message || data?.error || text || `football-data request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.requestsAvailable = requestsAvailable;
      error.resetInSeconds = resetInSeconds;
      if (response.status === 429 && Number.isFinite(resetInSeconds) && resetInSeconds > 0) {
        blockedUntil = Date.now() + (resetInSeconds * 1000);
      }
      throw error;
    }

    return {
      data,
      meta: {
        requestsAvailable,
        resetInSeconds,
        apiVersion: response.headers.get("x-api-version") || "",
      },
    };
  }

  async function fetchWorldCupSeasonSnapshot(year) {
    const season = Number(year);
    const cacheKey = `snapshot:${season}`;
    const cached = snapshotCache.get(cacheKey);
    if (cached && (Date.now() - cached.cachedAt) < SNAPSHOT_CACHE_TTL_MS) {
      return cached.value;
    }

    const [competitionResponse, standingsResponse, teamsResponse, matchesResponse] = await Promise.all([
      fetchJson(`/competitions/${WORLD_CUP_CODE}`),
      fetchJson(`/competitions/${WORLD_CUP_CODE}/standings?season=${season}`),
      fetchJson(`/competitions/${WORLD_CUP_CODE}/teams?season=${season}`),
      fetchJson(`/competitions/${WORLD_CUP_CODE}/matches?season=${season}`),
    ]);

    const standingsByTeamId = buildStandingsIndex(standingsResponse.data);
    const groups = buildGroups(standingsResponse.data, matchesResponse.data, standingsByTeamId);
    const fixtureStages = buildFixtureStages(matchesResponse.data, standingsByTeamId);
    const rounds = buildKnockoutSnapshot(fixtureStages);
    const entrants = buildQualifiedEntrants(groups, rounds);
    const allTeams = (teamsResponse.data?.teams || []).map((team) => mapTeam(team, standingsByTeamId));
    const winnerTeamId = Number(competitionResponse.data?.currentSeason?.winner?.id) || null;

    const snapshot = {
      year: season,
      eventId: Number(competitionResponse.data?.id) || 2000,
      eventName: competitionResponse.data?.name || `FIFA World Cup ${season}`,
      eventDates: {
        start: competitionResponse.data?.currentSeason?.startDate || "",
        end: competitionResponse.data?.currentSeason?.endDate || "",
      },
      sampleDataYear: season,
      dataSourceMode: "live",
      dataSourceLabel: "football-data.org live data",
      dataSourceUrl: "https://www.football-data.org/documentation/quickstart/",
      apiVersion: competitionResponse.meta.apiVersion || "",
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

    snapshotCache.set(cacheKey, { cachedAt: Date.now(), value: snapshot });
    return snapshot;
  }

  return {
    key: "football-data.org",
    async getSnapshot(year) {
      if (Number(year) !== 2022) {
        return upcomingSnapshotBuilder(year);
      }

      if (lastFailureFallback && Date.now() < lastFailureFallback.expiresAt) {
        return lastFailureFallback.snapshot;
      }

      try {
        const snapshot = await fetchWorldCupSeasonSnapshot(year);
        lastFailureFallback = null;
        return snapshot;
      } catch (error) {
        console.warn(`[football-data] snapshot fallback for ${year}:`, error?.message || error);
        const fallback = Number(year) === 2022
          ? fallbackSnapshotBuilder(year)
          : upcomingSnapshotBuilder(year);
        const fallbackSnapshot = {
          ...fallback,
          dataSourceMode: Number(year) === 2022 ? "fallback-static" : fallback.dataSourceMode,
          dataSourceLabel: Number(year) === 2022 ? "Static fallback after football-data.org error" : fallback.dataSourceLabel,
        };
        lastFailureFallback = {
          snapshot: fallbackSnapshot,
          expiresAt: Date.now() + ((error?.status === 429 ? Math.max((error.resetInSeconds || 0) * 1000, RATE_LIMIT_FALLBACK_TTL_MS) : RATE_LIMIT_FALLBACK_TTL_MS)),
        };
        return fallbackSnapshot;
      }
    },
    async getHeadToHead(player1Id, player2Id, year) {
      const snapshot = await this.getSnapshot(year);
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

function getAllMatchesFromSnapshot(snapshot) {
  if (snapshot?.fixtureStages?.length) {
    return snapshot.fixtureStages.flatMap((stage) => stage.matches || []);
  }
  return snapshot?.rounds?.flatMap((round) => round.matches || []) || [];
}
