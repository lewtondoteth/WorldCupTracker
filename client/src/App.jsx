import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import crownIcon from "../../res/crown.png";
import dogsPlayingPool from "../../res/dogsplayingpool.webp";

const APP_ENV = import.meta.env.VITE_APP_ENV || (import.meta.env.DEV ? "local" : "production");
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const API_TARGET = API_BASE || "same-origin /api";
const BRAND_NAME = "The Pellegrino Classic";
const BRAND_SHORT_NAME = "Pellegrino Classic";
const PUBLIC_DEFAULT_YEAR = new Date().getFullYear();
const PUBLIC_YEAR_OPTIONS = PUBLIC_DEFAULT_YEAR >= 2027
  ? Array.from({ length: 6 }, (_, index) => PUBLIC_DEFAULT_YEAR - index)
  : [2026, 2025];
const ADMIN_DEFAULT_YEAR = new Date().getFullYear();
const ADMIN_YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => ADMIN_DEFAULT_YEAR - index);
const WINNER_YEAR_OPTIONS = Array.from({ length: ADMIN_DEFAULT_YEAR - 2019 + 1 }, (_, index) => ADMIN_DEFAULT_YEAR - index);
const ADMIN_PASSWORD = "painting";
const ADMIN_SESSION_KEY = "snooker-admin-authenticated";
const PUBLIC_YEAR_SESSION_KEY = "snooker-public-selected-year";
const PUBLIC_SHOW_PHOTOS_SESSION_KEY = "snooker-public-show-photos";
const MATCHES_ROUND_SESSION_KEY = "snooker-public-matches-round";
const MATCHES_ENTRANT_FILTERS_SESSION_KEY = "snooker-public-matches-entrant-filters";
const MATCHES_PLAYER_FILTER_TEXT_SESSION_KEY = "snooker-public-matches-player-filter";
const MATCHES_COUNTRY_FILTERS_SESSION_KEY = "snooker-public-matches-country-filters";

function createEntrantId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `entrant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function useSessionState(key, initialValue) {
  const [value, setValue] = useState(() => {
    const fallbackValue = typeof initialValue === "function" ? initialValue() : initialValue;

    if (typeof window === "undefined") {
      return fallbackValue;
    }

    try {
      const storedValue = window.sessionStorage.getItem(key);
      return storedValue === null ? fallbackValue : JSON.parse(storedValue);
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore session storage failures and keep the in-memory value.
    }
  }, [key, value]);

  return [value, setValue];
}

function usePublicSelectedYear() {
  const [selectedYear, setSelectedYear] = useSessionState(
    PUBLIC_YEAR_SESSION_KEY,
    () => PUBLIC_DEFAULT_YEAR,
  );

  useEffect(() => {
    if (!PUBLIC_YEAR_OPTIONS.includes(selectedYear)) {
      setSelectedYear(PUBLIC_DEFAULT_YEAR);
    }
  }, [selectedYear, setSelectedYear]);

  return [PUBLIC_YEAR_OPTIONS.includes(selectedYear) ? selectedYear : PUBLIC_DEFAULT_YEAR, setSelectedYear];
}

function usePublicShowPhotos() {
  return useSessionState(PUBLIC_SHOW_PHOTOS_SESSION_KEY, true);
}

function normaliseSessionList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim());
  }

  if (typeof value === "string" && value.trim() && value !== "all") {
    return [value.trim()];
  }

  return [];
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
      throw new Error(`The API returned HTML instead of JSON. App env: ${APP_ENV}. Make sure the backend is running on ${API_TARGET} and that VITE_API_BASE points to the API server when developing locally.`);
    }
    throw new Error(fallbackMessage);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

async function fetchPool(year) {
  const response = await fetch(`${API_BASE}/api/pool/${year}`);
  return readJsonResponse(response, "Failed to load pool data");
}

async function uploadPool(payload, year = PUBLIC_DEFAULT_YEAR) {
  const response = await fetch(`${API_BASE}/api/pool/${year}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Upload failed");
}

async function fetchAdminPoolBuilder(year) {
  const response = await fetch(`${API_BASE}/api/pool/${year}/admin`);
  return readJsonResponse(response, "Failed to load admin builder");
}

async function saveAdminPoolBuilder(year, payload) {
  const response = await fetch(`${API_BASE}/api/pool/${year}/admin`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Save failed");
}

async function fetchEntrants() {
  const response = await fetch(`${API_BASE}/api/entrants`);
  return readJsonResponse(response, "Failed to load entrants");
}

async function saveEntrants(payload) {
  const response = await fetch(`${API_BASE}/api/entrants`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Failed to save entrants");
}

const NATIONALITY_FLAGS = {
  Australia: "AU",
  Belgium: "BE",
  China: "CN",
  England: "GB",
  HongKong: "HK",
  "Hong Kong": "HK",
  Iran: "IR",
  Ireland: "IE",
  "Northern Ireland": "GB",
  Pakistan: "PK",
  Scotland: "GB",
  Thailand: "TH",
  Ukraine: "UA",
  Wales: "GB",
};

function getNationalityFlag(nationality) {
  const code = NATIONALITY_FLAGS[String(nationality || "").trim()] || "";
  if (!code || code.length !== 2) {
    return "";
  }
  return code
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function PlayerIdentity({ player, compact = false, showPhoto = true, ownerName = "" }) {
  const flag = getNationalityFlag(player.nationality);
  const identityClassName = `${compact ? "player-identity compact" : "player-identity"}${player.eliminated ? " eliminated" : ""}`;

  return (
    <div className={identityClassName}>
      {showPhoto ? (
        <div className="player-avatar-shell">
          {player.photo ? (
            <img className="player-avatar" src={player.photo} alt="" loading="lazy" />
          ) : (
            <div className="player-avatar fallback" aria-hidden="true">
              {String(player.name || "?").trim().slice(0, 1)}
            </div>
          )}
        </div>
      ) : null}
      <div className="player-text">
        <strong>{player.name}{ownerName ? ` (${ownerName})` : ""}</strong>
        <small>
          {flag ? <span className="player-flag" aria-hidden="true">{flag}</span> : null}
          <span>{player.nationality || "Unknown"}</span>
        </small>
      </div>
    </div>
  );
}

function PickList({ title, players, showPhotos }) {
  return (
    <section className="pick-group">
      <div className="pick-group-header">
        <h3>{title}</h3>
      </div>
      <ul className="pick-list">
        {players.map((player) => (
          <li key={player.id} className={player.eliminated ? "pick-row eliminated" : "pick-row"}>
            <PlayerIdentity player={player} showPhoto={showPhotos} />
            <span className={`pick-status ${player.statusTone}`}>{player.roundStatusLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChevronToggle({ expanded, onToggle, label, className = "" }) {
  return (
    <button
      type="button"
      className={className ? `chevron-toggle ${className}` : "chevron-toggle"}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
      title={expanded ? `Collapse ${label}` : `Expand ${label}`}
    >
      <span className={expanded ? "chevron-icon expanded" : "chevron-icon"} aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

function isPlaceholderMatchPlayer(player) {
  const name = String(player?.name || "").trim();
  return !name || /^tbd$/i.test(name);
}

function isPlaceholderEntrant(entry) {
  const name = String(entry?.name || "").trim();
  return !name || /^tbd$/i.test(name);
}

function shuffleArray(items) {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
}

function buildBalancedTargetCounts(total, entrantIds) {
  const targets = new Map(entrantIds.map((entrantId) => [entrantId, Math.floor(total / entrantIds.length)]));
  const remainder = total % entrantIds.length;
  for (const entrantId of shuffleArray(entrantIds).slice(0, remainder)) {
    targets.set(entrantId, (targets.get(entrantId) || 0) + 1);
  }
  return targets;
}

function buildSuggestedTargetCounts(total, entrantIds) {
  const targets = new Map(entrantIds.map((entrantId) => [entrantId, Math.floor(total / entrantIds.length)]));
  const remainder = total % entrantIds.length;
  entrantIds.slice(0, remainder).forEach((entrantId) => {
    targets.set(entrantId, (targets.get(entrantId) || 0) + 1);
  });
  return targets;
}

function normaliseTargetCountInput(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function buildAutoAssignment(snapshot, competitors, targetCountsOverride = null) {
  const roundOne = snapshot.rounds.find((round) => round.key === "round-1") || snapshot.rounds[0];
  const actualPlayers = snapshot.entrants.filter((entry) => !isPlaceholderEntrant(entry));
  const entrantOrder = new Map(snapshot.entrants.map((entry, index) => [entry.id, index]));
  const entrantIds = competitors.map((competitor, index) => competitor.entrantId || `competitor-${index}`);

  if (!entrantIds.length) {
    throw new Error("Add at least one entrant before running automatic assignment.");
  }

  if (entrantIds.length < 2 && roundOne?.matches.some((match) => (
    !isPlaceholderMatchPlayer(match.player1) && !isPlaceholderMatchPlayer(match.player2)
  ))) {
    throw new Error("At least two entrants are needed to separate first-round opponents.");
  }

  const bucketKeyForPlayer = (player) => (player.isSeed ? "seedIds" : "qualifierIds");
  const allSeeds = actualPlayers.filter((player) => player.isSeed);
  const allQualifiers = actualPlayers.filter((player) => !player.isSeed);
  const targetCounts = targetCountsOverride || {
    seedIds: buildBalancedTargetCounts(allSeeds.length, entrantIds),
    qualifierIds: buildBalancedTargetCounts(allQualifiers.length, entrantIds),
  };

  const candidateMatches = shuffleArray(roundOne?.matches || []);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const nextCompetitors = competitors.map((competitor) => ({
      ...competitor,
      seedIds: [],
      qualifierIds: [],
    }));
    const competitorIndexById = new Map(nextCompetitors.map((competitor, index) => [
      competitor.entrantId || `competitor-${index}`,
      index,
    ]));
    const bucketCountsByEntrant = new Map(entrantIds.map((entrantId) => [
      entrantId,
      { seedIds: 0, qualifierIds: 0 },
    ]));
    const ownerByPlayerId = new Map();
    const assignedPlayerIds = new Set();

    function assignPlayerToEntrant(player, excludedEntrantId = null) {
      const bucket = bucketKeyForPlayer(player);
      const eligibleEntrants = entrantIds.filter((entrantId) => entrantId !== excludedEntrantId);
      if (!eligibleEntrants.length) {
        return null;
      }

      const withCapacity = eligibleEntrants.filter((entrantId) => (
        (bucketCountsByEntrant.get(entrantId)?.[bucket] || 0) < (targetCounts[bucket].get(entrantId) || 0)
      ));
      const candidateEntrants = (withCapacity.length ? withCapacity : eligibleEntrants)
        .map((entrantId) => ({
          entrantId,
          count: bucketCountsByEntrant.get(entrantId)?.[bucket] || 0,
        }));
      const minCount = Math.min(...candidateEntrants.map((candidate) => candidate.count));
      const lowestFilled = candidateEntrants.filter((candidate) => candidate.count === minCount);
      const chosen = lowestFilled[Math.floor(Math.random() * lowestFilled.length)];
      if (!chosen) {
        return null;
      }

      const competitorIndex = competitorIndexById.get(chosen.entrantId);
      if (competitorIndex === undefined) {
        return null;
      }

      nextCompetitors[competitorIndex] = {
        ...nextCompetitors[competitorIndex],
        [bucket]: [...nextCompetitors[competitorIndex][bucket], player.id],
      };
      bucketCountsByEntrant.set(chosen.entrantId, {
        ...bucketCountsByEntrant.get(chosen.entrantId),
        [bucket]: (bucketCountsByEntrant.get(chosen.entrantId)?.[bucket] || 0) + 1,
      });
      ownerByPlayerId.set(player.id, chosen.entrantId);
      assignedPlayerIds.add(player.id);
      return chosen.entrantId;
    }

    let failed = false;

    for (const match of candidateMatches) {
      const sides = [match.player1, match.player2].filter((player) => !isPlaceholderMatchPlayer(player));
      if (!sides.length) {
        continue;
      }

      const unassignedSides = shuffleArray(sides.filter((player) => !assignedPlayerIds.has(player.id)));
      if (!unassignedSides.length) {
        continue;
      }

      if (unassignedSides.length === 2) {
        const [firstSide, secondSide] = unassignedSides;
        const firstOwner = assignPlayerToEntrant(firstSide);
        if (!firstOwner) {
          failed = true;
          break;
        }
        const secondOwner = assignPlayerToEntrant(secondSide, firstOwner);
        if (!secondOwner) {
          failed = true;
          break;
        }
        continue;
      }

      const soloSide = unassignedSides[0];
      const opponent = sides.find((player) => player.id !== soloSide.id);
      const blockedEntrantId = opponent ? ownerByPlayerId.get(opponent.id) || null : null;
      if (!assignPlayerToEntrant(soloSide, blockedEntrantId)) {
        failed = true;
        break;
      }
    }

    if (failed) {
      continue;
    }

    const leftoverPlayers = shuffleArray(actualPlayers.filter((player) => !assignedPlayerIds.has(player.id)));
    for (const player of leftoverPlayers) {
      if (!assignPlayerToEntrant(player)) {
        failed = true;
        break;
      }
    }

    if (failed) {
      continue;
    }

    const hasConflict = (roundOne?.matches || []).some((match) => {
      if (isPlaceholderMatchPlayer(match.player1) || isPlaceholderMatchPlayer(match.player2)) {
        return false;
      }
      const leftOwner = ownerByPlayerId.get(match.player1.id);
      const rightOwner = ownerByPlayerId.get(match.player2.id);
      return Boolean(leftOwner && rightOwner && leftOwner === rightOwner);
    });

    if (hasConflict || assignedPlayerIds.size !== actualPlayers.length) {
      continue;
    }

    const sortedCompetitors = nextCompetitors.map((competitor) => ({
      ...competitor,
      seedIds: [...competitor.seedIds].sort((left, right) => (entrantOrder.get(left) ?? 999) - (entrantOrder.get(right) ?? 999)),
      qualifierIds: [...competitor.qualifierIds].sort((left, right) => (entrantOrder.get(left) ?? 999) - (entrantOrder.get(right) ?? 999)),
    }));

    return {
      competitors: sortedCompetitors,
      assignedSeedCount: allSeeds.length,
      assignedQualifierCount: allQualifiers.length,
    };
  }

  throw new Error("Automatic assignment could not find a valid draw. Try adding more entrants or refreshing the player list.");
}

function SiteHeader({ mode = "home", poolConfigured = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-nav">
      <div className="site-nav-top">
        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-primary-nav"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
        <Link className="admin-link mobile-admin-link" to="/admin" onClick={closeMenu}>Admin</Link>
      </div>
      <div className={`site-nav-center${menuOpen ? " mobile-open" : ""}`}>
        <nav id="site-primary-nav" className="site-menu" aria-label="Primary">
          {mode === "home" ? (
            <>
              <a className="site-menu-link" href="#overview" onClick={closeMenu}>Overview</a>
              {poolConfigured ? <Link className="site-menu-link" to="/entrants" onClick={closeMenu}>Entrants</Link> : null}
              <Link className="site-menu-link" to="/matches" onClick={closeMenu}>Matches</Link>
              <Link className="site-menu-link" to="/bracket" onClick={closeMenu}>Bracket</Link>
              <Link className="site-menu-link" to="/winners" onClick={closeMenu}>Winners</Link>
            </>
          ) : (
            <>
              <Link className="site-menu-link" to="/" onClick={closeMenu}>Tournament</Link>
              {poolConfigured ? <Link className={`site-menu-link${mode === "entrants" ? " current" : ""}`} to="/entrants" onClick={closeMenu}>Entrants</Link> : null}
              <Link className={`site-menu-link${mode === "matches" ? " current" : ""}`} to="/matches" onClick={closeMenu}>Matches</Link>
              <Link className={`site-menu-link${mode === "bracket" ? " current" : ""}`} to="/bracket" onClick={closeMenu}>Bracket</Link>
              <Link className={`site-menu-link${mode === "winners" ? " current" : ""}`} to="/winners" onClick={closeMenu}>Winners</Link>
            </>
          )}
        </nav>
        <Link className="admin-link desktop-admin-link" to="/admin" onClick={closeMenu}>Admin</Link>
      </div>
    </header>
  );
}

function isActiveTournamentMatch(match) {
  return !isPlaceholderMatchPlayer(match?.player1) && !isPlaceholderMatchPlayer(match?.player2);
}

function isOpenTournamentMatch(match) {
  return isActiveTournamentMatch(match) && (match.unfinished || !match.winnerId);
}

function MatchCard({ match, showPhotos, ownershipByPlayerId }) {
  const metaBits = [
    match.tableNo ? `Table ${match.tableNo}` : null,
    match.startDate ? `Start ${match.startDate.slice(0, 10)}` : null,
    match.endDate ? `End ${match.endDate.slice(0, 10)}` : null,
  ].filter(Boolean);

  const renderSide = (player, won) => (
    <div className={won ? "match-side winner" : "match-side loser"}>
      <PlayerIdentity
        player={player}
        compact
        showPhoto={showPhotos}
        ownerName={ownershipByPlayerId?.get(player.id)?.entrantName || ""}
      />
      <strong>{player.score}</strong>
    </div>
  );

  return (
    <article className="match-card">
      <div className="match-meta">
        <div className="match-meta-copy">
          <span>Match {match.number}</span>
          {metaBits.length ? (
            <small>{metaBits.join(" • ")}</small>
          ) : null}
        </div>
        <span>
          {isPlaceholderMatchPlayer(match.player1) || isPlaceholderMatchPlayer(match.player2)
            ? "Awaiting qualifier"
            : match.unfinished
              ? "In play"
              : match.scheduledDate.slice(0, 10)}
        </span>
      </div>
      {renderSide(match.player1, match.winnerId === match.player1.id)}
      {renderSide(match.player2, match.winnerId === match.player2.id)}
    </article>
  );
}

function AdminPlayerCard({ player, bucket, onDragStart, onDragEnd, onRemove }) {
  return (
    <li
      className="admin-player-card"
      draggable
      onDragStart={(event) => onDragStart(event, player, bucket)}
      onDragEnd={onDragEnd}
    >
      <div>
        <strong>{player.name}</strong>
        <small>{player.nationality || "Unknown"}</small>
      </div>
      <div className="admin-player-card-meta">
        <span className="admin-player-chip">{player.isSeed ? `Seed ${player.seedNumber}` : "Qualifier"}</span>
        {onRemove ? (
          <button type="button" className="admin-player-remove" onClick={() => onRemove(player.id, bucket)}>
            Remove
          </button>
        ) : null}
      </div>
    </li>
  );
}

function AdminPlayerLane({
  title,
  bucket,
  players,
  emptyCopy,
  onDrop,
  onDragStart,
  onDragEnd,
  onRemove,
  assignablePlayers,
  onAssign,
  assignLabel,
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  useEffect(() => {
    if (!assignablePlayers?.some((player) => String(player.id) === selectedPlayerId)) {
      setSelectedPlayerId("");
    }
  }, [assignablePlayers, selectedPlayerId]);

  return (
    <section
      className={players.length ? "admin-player-lane" : "admin-player-lane empty"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, bucket)}
    >
      <div className="admin-player-lane-header">
        <h3>{title}</h3>
        <span>{players.length}</span>
      </div>
      {assignablePlayers?.length && onAssign ? (
        <div className="admin-lane-assign">
          <label className="toolbar-select-shell admin-select-shell">
            <select
              className="toolbar-select"
              value={selectedPlayerId}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
              aria-label={assignLabel || `Add player to ${title}`}
            >
              <option value="">{assignLabel || "Add player"}</option>
              {assignablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-secondary-button admin-inline-add-button"
            onClick={() => {
              if (!selectedPlayerId) {
                return;
              }
              onAssign(Number(selectedPlayerId), bucket);
              setSelectedPlayerId("");
            }}
            disabled={!selectedPlayerId}
          >
            Add
          </button>
        </div>
      ) : null}
      {players.length ? (
        <ul className="admin-player-list">
          {players.map((player) => (
            <AdminPlayerCard
              key={player.id}
              player={player}
              bucket={bucket}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onRemove={onRemove}
            />
          ))}
        </ul>
      ) : (
        <p className="admin-empty-copy">{emptyCopy}</p>
      )}
    </section>
  );
}

function getDefaultRoundKey(snapshot) {
  const rounds = snapshot?.rounds || [];
  if (!rounds.length) {
    return "";
  }

  const firstIncompleteRound = rounds.find((round) => (
    round.matches.length > 0
      && round.matches.some((match) => isOpenTournamentMatch(match))
  ));
  if (firstIncompleteRound) {
    return firstIncompleteRound.key;
  }

  const latestStartedRound = [...rounds].reverse().find((round) => round.matches.some((match) => isActiveTournamentMatch(match)));
  return latestStartedRound?.key || rounds[0].key;
}

function buildOwnershipMap(competitors) {
  const ownershipByPlayerId = new Map();

  for (const competitor of competitors || []) {
    const assignedPlayers = [...(competitor.seeds || []), ...(competitor.qualifiers || [])];
    for (const player of assignedPlayers) {
      if (!player?.id || ownershipByPlayerId.has(player.id)) {
        continue;
      }
      ownershipByPlayerId.set(player.id, {
        entrantId: competitor.entrantId || competitor.name,
        entrantName: competitor.name,
        winningYears: competitor.winningYears || [],
      });
    }
  }

  return ownershipByPlayerId;
}

function createPendingBracketSide(label) {
  return {
    id: `pending-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    entrantName: "Awaiting entrant",
    playerName: label,
    score: null,
    isPlaceholder: true,
    isUnassigned: false,
  };
}

function createBracketSideFromPlayer(player, ownershipByPlayerId) {
  if (!player || isPlaceholderMatchPlayer(player)) {
    return createPendingBracketSide("Awaiting player");
  }

  const owner = ownershipByPlayerId.get(player.id);
  return {
    id: player.id,
    entrantName: owner?.entrantName || "Unassigned entrant",
    winningYears: owner?.winningYears || [],
    playerName: player.name,
    score: Number.isFinite(Number(player.score)) ? Number(player.score) : null,
    isPlaceholder: false,
    isUnassigned: !owner,
  };
}

function deriveBracketSideFromPreviousMatch(previousMatch, fallbackLabel) {
  if (!previousMatch) {
    return createPendingBracketSide(fallbackLabel || "Awaiting result");
  }

  if (previousMatch.winnerSide) {
    return { ...previousMatch.winnerSide };
  }

  return createPendingBracketSide(`Winner of ${previousMatch.label}`);
}

function buildBracketRounds(snapshotRounds, competitors) {
  const ownershipByPlayerId = buildOwnershipMap(competitors);
  const builtRounds = [];

  for (const [roundIndex, round] of snapshotRounds.entries()) {
    const sortedMatches = [...(round.matches || [])].sort((left, right) => left.number - right.number);
    const expectedMatchCount = Math.max(
      sortedMatches.length,
      Math.max(1, Math.floor((round.entrantsLeft || 2) / 2)),
    );

    const bracketMatches = Array.from({ length: expectedMatchCount }, (_, matchIndex) => {
      const actualMatch = sortedMatches[matchIndex] || null;
      const previousRoundMatches = roundIndex > 0 ? builtRounds[roundIndex - 1]?.bracketMatches || [] : [];
      const leftFeeder = previousRoundMatches[matchIndex * 2];
      const rightFeeder = previousRoundMatches[matchIndex * 2 + 1];
      let side1;
      let side2;

      if (actualMatch) {
        side1 = !isPlaceholderMatchPlayer(actualMatch.player1)
          ? createBracketSideFromPlayer(actualMatch.player1, ownershipByPlayerId)
          : roundIndex === 0
            ? createPendingBracketSide("Awaiting draw")
            : deriveBracketSideFromPreviousMatch(leftFeeder, "Awaiting previous match");
        side2 = !isPlaceholderMatchPlayer(actualMatch.player2)
          ? createBracketSideFromPlayer(actualMatch.player2, ownershipByPlayerId)
          : roundIndex === 0
            ? createPendingBracketSide("Awaiting draw")
            : deriveBracketSideFromPreviousMatch(rightFeeder, "Awaiting previous match");
      } else if (roundIndex === 0) {
        side1 = createPendingBracketSide("Awaiting draw");
        side2 = createPendingBracketSide("Awaiting draw");
      } else {
        side1 = deriveBracketSideFromPreviousMatch(leftFeeder, "Awaiting previous match");
        side2 = deriveBracketSideFromPreviousMatch(rightFeeder, "Awaiting previous match");
      }

      const winnerSide = actualMatch?.winnerId
        ? [side1, side2].find((side) => side.id === actualMatch.winnerId) || null
        : null;

      return {
        key: `${round.key}-${matchIndex + 1}`,
        label: actualMatch ? `${round.shortLabel} ${actualMatch.number}` : `${round.shortLabel} ${matchIndex + 1}`,
        number: actualMatch?.number || matchIndex + 1,
        state: actualMatch ? (actualMatch.unfinished ? "in-play" : "finished") : "pending",
        scheduledDate: actualMatch?.scheduledDate || "",
        slotSpan: 2 ** (roundIndex + 1),
        side1,
        side2,
        winnerSide,
      };
    });

    builtRounds.push({
      ...round,
      bracketMatches,
    });
  }

  return builtRounds;
}

function usePublicTournamentData(selectedYear) {
  const [data, setData] = useState(null);
  const [publicEntrants, setPublicEntrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load(showLoadingState = true) {
      if (showLoadingState) {
        setLoading(true);
      }
      setError("");
      try {
        const [nextData, entrantsResponse] = await Promise.all([
          fetchPool(selectedYear),
          fetchEntrants(),
        ]);
        if (!cancelled) {
          setData(nextData);
          setPublicEntrants(entrantsResponse.entrants || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load tournament data.");
        }
      } finally {
        if (!cancelled && showLoadingState) {
          setLoading(false);
        }
      }
    }

    load();

    const refreshId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load(false);
      }
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, [selectedYear]);

  return { data, publicEntrants, loading, error };
}

function useTournamentOverview(selectedYear) {
  const { data, publicEntrants, loading, error } = usePublicTournamentData(selectedYear);
  const [selectedRoundKey, setSelectedRoundKey] = useState("");
  const autoSelectedRoundYearRef = useRef(null);

  useEffect(() => {
    if (!data?.snapshot?.rounds?.length) {
      return;
    }

    const preferredRoundKey = getDefaultRoundKey(data.snapshot);
    const roundExists = data.snapshot.rounds.some((round) => round.key === selectedRoundKey);
    const shouldAutoSelect = autoSelectedRoundYearRef.current !== data.snapshot.year;

    if (shouldAutoSelect || !roundExists) {
      setSelectedRoundKey(preferredRoundKey);
      autoSelectedRoundYearRef.current = data.snapshot.year;
    }
  }, [data, selectedRoundKey]);

  function toggleCompetitor(name) {
    setExpandedCompetitors((current) => ({
      ...current,
      [name]: !(current[name] ?? true),
    }));
  }

  const derived = useMemo(() => {
    if (!data?.snapshot?.rounds?.length) {
      return null;
    }

    const { snapshot, competitors } = data;
    const registryById = new Map(publicEntrants.map((entrant) => [String(entrant.id), entrant]));
    const registryByName = new Map(publicEntrants.map((entrant) => [entrant.name.toLowerCase(), entrant]));
    const selectedRound = snapshot.rounds.find((round) => round.key === selectedRoundKey) || snapshot.rounds[0];
    const currentRound = snapshot.rounds.find((round) => round.key === getDefaultRoundKey(snapshot)) || selectedRound;
    const roundOrderById = new Map(snapshot.rounds.map((round) => [round.id, round.order]));
    const previousRound = snapshot.rounds.find((round) => round.order === selectedRound.order - 1) || null;
    const currentRoundMatchByPlayerId = new Map();
    for (const match of selectedRound.matches) {
      currentRoundMatchByPlayerId.set(match.player1.id, match);
      currentRoundMatchByPlayerId.set(match.player2.id, match);
    }

    const entrantsById = new Map(
      snapshot.entrants.map((entry) => {
        const eliminatedOrder = entry.eliminatedInRoundId ? roundOrderById.get(entry.eliminatedInRoundId) : null;
        const eliminated = eliminatedOrder !== null && eliminatedOrder <= selectedRound.order;
        const currentMatch = currentRoundMatchByPlayerId.get(entry.id);
        const inPlay = Boolean(currentMatch?.unfinished);
        const hasCurrentRoundMatch = Boolean(currentMatch);
        const roundHasAnyMatches = selectedRound.matches.length > 0;
        const reachedSelectedRound = previousRound
          ? !entry.eliminatedInRoundId || (roundOrderById.get(entry.eliminatedInRoundId) ?? Infinity) > previousRound.order
          : true;
        const throughToNextRound = !eliminated && !inPlay && (
          entry.isChampion ||
          (entry.eliminatedInRoundId !== selectedRound.id && selectedRound.order < snapshot.rounds.length)
        );

        let roundStatusLabel = entry.isSeed ? `Seed ${entry.seedNumber}` : "Qualifier";
        let statusTone = "neutral";

        if (eliminated) {
          roundStatusLabel = "Eliminated";
          statusTone = "eliminated";
        } else if (inPlay) {
          roundStatusLabel = "In play";
          statusTone = "in-play";
        } else if (!roundHasAnyMatches && selectedRound.order > 1 && reachedSelectedRound) {
          roundStatusLabel = "Awaiting round start";
          statusTone = "waiting";
        } else if (roundHasAnyMatches && !hasCurrentRoundMatch && selectedRound.order > 1 && reachedSelectedRound && !entry.isChampion) {
          roundStatusLabel = "Awaiting match";
          statusTone = "waiting";
        } else if (throughToNextRound) {
          roundStatusLabel = selectedRound.order === snapshot.rounds.length ? "Champion" : "Advanced";
          statusTone = "through";
        }

        return [entry.id, { ...entry, eliminated, inPlay, roundStatusLabel, statusTone }];
      }),
    );

    const decoratedCompetitors = competitors.map((competitor) => ({
      ...competitor,
      winningYears: competitor.winningYears
        || registryById.get(String(competitor.entrantId))?.winningYears
        || registryByName.get(String(competitor.name).toLowerCase())?.winningYears
        || [],
      seeds: competitor.seeds.map((player) => entrantsById.get(player.id)),
      qualifiers: competitor.qualifiers.map((player) => entrantsById.get(player.id)),
    }));
    const aliveEntrantsCount = Array.from(entrantsById.values()).filter((entry) => !entry.eliminated).length;
    const totalFieldSize = snapshot.rounds.reduce(
      (max, round) => Math.max(max, Number(round.entrantsLeft) || 0),
      snapshot.entrants.length,
    );
    const qualifiedEntrantsCount = snapshot.entrants.filter((entry) => !isPlaceholderEntrant(entry)).length;
    const spacesLeftCount = Math.max(0, totalFieldSize - qualifiedEntrantsCount);
    const hasTbdEntrants = spacesLeftCount > 0;
    const finalRound = snapshot.rounds[snapshot.rounds.length - 1] || null;
    const tournamentComplete = Boolean(finalRound?.matches?.length) && finalRound.matches.every((match) => Boolean(match.winnerId));
    const championPlayer = snapshot.entrants.find((entry) => entry.isChampion && !entry.isPlaceholder) || null;
    const winningCompetitor = championPlayer
      ? decoratedCompetitors.find((competitor) => (
        competitor.seeds.some((player) => player?.id === championPlayer.id)
        || competitor.qualifiers.some((player) => player?.id === championPlayer.id)
      )) || null
      : null;
    const unresolvedScheduledMatches = selectedRound.matches.filter((match) => !match.winnerId).length;
    const unplayedMatchCount = selectedRound.matches.length
      ? unresolvedScheduledMatches
      : (selectedRound.matchCount || 0);

    return {
      selectedRound,
      currentRound,
      aliveEntrantsCount,
      qualifiedEntrantsCount,
      spacesLeftCount,
      hasTbdEntrants,
      tournamentComplete,
      winningCompetitorName: winningCompetitor?.name || championPlayer?.name || "",
      championPlayerName: championPlayer?.name || "",
      unplayedMatchCount,
      decoratedCompetitors,
    };
  }, [data, publicEntrants, selectedRoundKey]);

  return {
    data,
    loading,
    error,
    selectedRoundKey,
    setSelectedRoundKey,
    derived,
  };
}

function HomePage() {
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const {
    data,
    loading,
    error,
    selectedRoundKey,
    setSelectedRoundKey,
    derived,
  } = useTournamentOverview(selectedYear);

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading {BRAND_NAME} {selectedYear}...</p></main>;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return <main className="app-shell"><p className="status-banner error">{error || "Tournament data is unavailable."}</p></main>;
  }

  const { snapshot } = data;
  const {
    selectedRound,
    currentRound,
    aliveEntrantsCount,
    qualifiedEntrantsCount,
    spacesLeftCount,
    hasTbdEntrants,
    tournamentComplete,
    winningCompetitorName,
    championPlayerName,
    unplayedMatchCount,
  } = derived;
  const poolConfigured = data.poolConfigured !== false;
  const isYearSwitching = loading && Boolean(data) && data.snapshot?.year !== selectedYear;

  return (
    <main className="app-shell">
      <SiteHeader mode="home" poolConfigured={poolConfigured} />

      {isYearSwitching ? (
        <p className="status-banner" aria-live="polite">
          Loading the {selectedYear} overview. You are still seeing {data.snapshot?.year} until the new tournament finishes loading.
        </p>
      ) : null}

      <section className="hero-card" id="overview">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-grid" />
        <div className="hero-header">
          <div className="hero-copy">
            <p className="hero-kicker">Live tournament dashboard 2026</p>
            <h1>
              {BRAND_NAME}
              <label className="hero-year-select-shell">
                <select
                  className="hero-year-select"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  aria-label="Select tournament year"
                >
                  {PUBLIC_YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </h1>
            <p className="hero-summary">
              Follow the family draw, keep tabs on every surviving pick, and see who is edging closer to taking the painting home.
            </p>
            <div className="hero-actions">
              {poolConfigured ? <Link className="admin-pill-link" to="/entrants">View entrants</Link> : null}
              <Link className="admin-pill-link subtle" to="/bracket">Open bracket</Link>
              <Link className="admin-pill-link subtle" to="/matches">Open matches</Link>
            </div>
          </div>
        </div>
        <div className="hero-image-shell">
          <img className="hero-image" src={dogsPlayingPool} alt="Dogs playing pool" />
        </div>
      </section>

      <section className="summary-strip">
        <article className="summary-card">
          <p className="toolbar-label">Event</p>
          <p className="summary-value">{BRAND_SHORT_NAME} {selectedYear}</p>
        </article>
        <article className="summary-card">
          <p className="toolbar-label">Current live round</p>
          <p className="summary-value">{tournamentComplete ? "Completed" : currentRound.name}</p>
        </article>
        <article className="summary-card">
          <p className="toolbar-label">{tournamentComplete ? "Winner" : hasTbdEntrants ? "Qualified so far" : "Entrants alive"}</p>
          <p className="summary-value">
            {tournamentComplete
              ? `${winningCompetitorName}${championPlayerName ? ` (${championPlayerName})` : ""}`
              : hasTbdEntrants
                ? qualifiedEntrantsCount
                : aliveEntrantsCount}
          </p>
          <p className="summary-copy">
            {tournamentComplete
              ? `Champion of the ${selectedYear} tournament`
              : hasTbdEntrants
              ? `${spacesLeftCount} space${spacesLeftCount === 1 ? "" : "s"} left to fill`
              : "Still live across the championship draw"}
          </p>
        </article>
        <article className="summary-card">
          <p className="toolbar-label">Live matches</p>
          <p className="summary-value">{unplayedMatchCount}</p>
          <p className="summary-copy">Still to be played in {selectedRound.name}</p>
        </article>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The {selectedYear} tournament is not fully configured yet. Match data is still available below, and you can finish setting up the tournament from admin.
        </p>
      ) : null}

    </main>
  );
}

function EntrantsPage() {
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const [showPhotos, setShowPhotos] = usePublicShowPhotos();
  const { data, loading, error, derived } = useTournamentOverview(selectedYear);
  const [expandedCompetitors, setExpandedCompetitors] = useState({});

  useEffect(() => {
    setExpandedCompetitors({});
  }, [data?.snapshot?.year]);

  function toggleCompetitor(name) {
    setExpandedCompetitors((current) => ({
      ...current,
      [name]: !(current[name] ?? true),
    }));
  }

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading entrants...</p></main>;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return <main className="app-shell"><p className="status-banner error">{error || "Entrant data is unavailable."}</p></main>;
  }

  const poolConfigured = data.poolConfigured !== false;
  const { decoratedCompetitors } = derived;

  return (
    <main className="app-shell">
      <SiteHeader mode="entrants" poolConfigured={poolConfigured} />

      <section className="bracket-hero-card">
        <div className="bracket-hero-copy">
          <p className="hero-kicker">Tournament standings</p>
          <h1>{BRAND_SHORT_NAME} Entrants</h1>
          <p className="hero-summary">
            See every entrant, their surviving players, and their winning history without crowding the landing page.
          </p>
        </div>
        <div className="bracket-toolbar">
          <div className="bracket-control bracket-control-year">
            <p className="toolbar-label">Year</p>
            <label className="toolbar-select-shell">
              <select
                className="toolbar-select"
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                aria-label="Select tournament year"
              >
                {PUBLIC_YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="bracket-control">
            <span className="bracket-inline-label">Entrants</span>
            <strong className="bracket-inline-value">{decoratedCompetitors.length}</strong>
          </div>
          <div className="bracket-control bracket-control-photos">
            <span className="bracket-inline-label">Player photos</span>
            <label className="toolbar-switch">
              <input
                type="checkbox"
                checked={showPhotos}
                onChange={(event) => setShowPhotos(event.target.checked)}
              />
              <span className="toolbar-switch-track">
                <span className="toolbar-switch-thumb" />
              </span>
              <span className="toolbar-switch-label">{showPhotos ? "On" : "Off"}</span>
            </label>
          </div>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The tournament is not fully configured yet. Entrant cards will appear here once assignments have been completed.
        </p>
      ) : null}

      {poolConfigured ? (
        <section className="competitor-grid">
          {decoratedCompetitors.map((competitor) => {
            const liveCount = [...competitor.seeds, ...competitor.qualifiers].filter((player) => !player.eliminated).length;
            const totalCount = competitor.seeds.length + competitor.qualifiers.length;
            const isExpanded = expandedCompetitors[competitor.name] ?? true;
            return (
              <article key={competitor.name} className="competitor-card">
                <div className="competitor-header">
                  <div className="competitor-heading">
                    <div className="collapsible-title-row">
                      <div className="competitor-title-inline">
                        <h2>{competitor.name}</h2>
                        <span className="live-pill inline">{liveCount} alive</span>
                        {(competitor.winningYears || []).length ? (
                          <div className="competitor-crowns" aria-label={`${competitor.winningYears.length} wins`}>
                            {competitor.winningYears.map((year) => (
                              <img
                                key={year}
                                className="competitor-crown"
                                src={crownIcon}
                                alt=""
                                aria-hidden="true"
                                title={`Winner ${year}`}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <ChevronToggle
                        expanded={isExpanded}
                        onToggle={() => toggleCompetitor(competitor.name)}
                        label={`${competitor.name} picks`}
                      />
                    </div>
                    <p className="competitor-meta-copy">{totalCount} picks</p>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="pick-columns">
                    <PickList title="Seeds" players={competitor.seeds} showPhotos={showPhotos} />
                    <PickList title="Qualifiers" players={competitor.qualifiers} showPhotos={showPhotos} />
                  </div>
                ) : (
                  <div className="collapsed-summary">
                    <span>{competitor.seeds.filter((player) => !player.eliminated).length} seed picks still alive</span>
                    <span>{competitor.qualifiers.filter((player) => !player.eliminated).length} qualifier picks still alive</span>
                    <span>{totalCount} picks assigned</span>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}

function MatchesPage() {
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const { data, loading, error } = usePublicTournamentData(selectedYear);
  const [selectedRoundKey, setSelectedRoundKey] = useSessionState(MATCHES_ROUND_SESSION_KEY, "");
  const [selectedEntrantFiltersRaw, setSelectedEntrantFilters] = useSessionState(MATCHES_ENTRANT_FILTERS_SESSION_KEY, []);
  const [playerFilterText, setPlayerFilterText] = useSessionState(MATCHES_PLAYER_FILTER_TEXT_SESSION_KEY, "");
  const [selectedCountryFiltersRaw, setSelectedCountryFilters] = useSessionState(MATCHES_COUNTRY_FILTERS_SESSION_KEY, []);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [showPhotos, setShowPhotos] = usePublicShowPhotos();
  const autoSelectedRoundYearRef = useRef(null);
  const selectedEntrantFilters = normaliseSessionList(selectedEntrantFiltersRaw);
  const selectedCountryFilters = normaliseSessionList(selectedCountryFiltersRaw);
  const playerNameTerms = useMemo(
    () => String(playerFilterText || "")
      .split(",")
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean),
    [playerFilterText],
  );

  useEffect(() => {
    if (!data?.snapshot?.rounds?.length) {
      return;
    }

    const preferredRoundKey = getDefaultRoundKey(data.snapshot);
    const roundExists = data.snapshot.rounds.some((round) => round.key === selectedRoundKey);
    const shouldAutoSelect = autoSelectedRoundYearRef.current !== data.snapshot.year;

    if (shouldAutoSelect || !roundExists) {
      setSelectedRoundKey(preferredRoundKey);
      autoSelectedRoundYearRef.current = data.snapshot.year;
    }
  }, [data, selectedRoundKey]);

  const ownershipByPlayerId = useMemo(
    () => buildOwnershipMap(data?.competitors || []),
    [data?.competitors],
  );
  const entrantOptions = useMemo(
    () => [...new Set(
      Array.from(ownershipByPlayerId.values())
        .map((owner) => owner?.entrantName || "")
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right)),
    [ownershipByPlayerId],
  );
  const countryOptions = useMemo(
    () => [...new Set(
      (data?.snapshot?.rounds || []).flatMap((round) => round.matches.flatMap((match) => [
        match.player1?.nationality || "",
        match.player2?.nationality || "",
      ]))
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right)),
    [data?.snapshot?.rounds],
  );

  useEffect(() => {
    const nextFilters = selectedEntrantFilters.filter((entrantName) => entrantOptions.includes(entrantName));
    if (JSON.stringify(nextFilters) !== JSON.stringify(selectedEntrantFiltersRaw)) {
      setSelectedEntrantFilters(nextFilters);
    }
  }, [entrantOptions, selectedEntrantFilters, selectedEntrantFiltersRaw, setSelectedEntrantFilters]);

  useEffect(() => {
    const nextFilters = selectedCountryFilters.filter((country) => countryOptions.includes(country));
    if (JSON.stringify(nextFilters) !== JSON.stringify(selectedCountryFiltersRaw)) {
      setSelectedCountryFilters(nextFilters);
    }
  }, [countryOptions, selectedCountryFilters, selectedCountryFiltersRaw, setSelectedCountryFilters]);

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading matches...</p></main>;
  }

  if (!data || !data.snapshot?.rounds?.length) {
    return <main className="app-shell"><p className="status-banner error">{error || "Match data is unavailable."}</p></main>;
  }

  const { snapshot } = data;
  const selectedRound = snapshot.rounds.find((round) => round.key === selectedRoundKey) || snapshot.rounds[0];
  const unresolvedScheduledMatches = selectedRound.matches.filter((match) => !match.winnerId).length;
  const unplayedMatchCount = selectedRound.matches.length
    ? unresolvedScheduledMatches
    : (selectedRound.matchCount || 0);
  const poolConfigured = data.poolConfigured !== false;
  const filteredMatches = selectedRound.matches.filter((match) => {
    const playerOneOwner = ownershipByPlayerId.get(match.player1.id)?.entrantName || "";
    const playerTwoOwner = ownershipByPlayerId.get(match.player2.id)?.entrantName || "";
    const playerNames = [
      String(match.player1?.name || "").toLowerCase(),
      String(match.player2?.name || "").toLowerCase(),
    ];
    const playerCountries = [
      match.player1?.nationality || "",
      match.player2?.nationality || "",
    ];

    const entrantMatches = !selectedEntrantFilters.length
      || selectedEntrantFilters.includes(playerOneOwner)
      || selectedEntrantFilters.includes(playerTwoOwner);
    const playerMatches = !playerNameTerms.length
      || playerNames.some((name) => playerNameTerms.some((term) => name.includes(term)));
    const countryMatches = !selectedCountryFilters.length
      || playerCountries.some((country) => selectedCountryFilters.includes(country));

    return entrantMatches && playerMatches && countryMatches;
  });
  const filteredUnplayedMatchCount = filteredMatches.filter((match) => !match.winnerId).length;
  const activeFilterCount = selectedEntrantFilters.length + selectedCountryFilters.length + playerNameTerms.length;

  function toggleFilterItem(currentValues, nextValue, setter) {
    setter(
      currentValues.includes(nextValue)
        ? currentValues.filter((value) => value !== nextValue)
        : [...currentValues, nextValue],
    );
  }

  return (
    <main className="app-shell">
      <SiteHeader mode="matches" poolConfigured={poolConfigured} />

      <section className="bracket-hero-card">
        <div className="bracket-hero-copy">
          <p className="hero-kicker">Round-by-round match centre</p>
          <h1>{BRAND_SHORT_NAME} Matches</h1>
          <p className="hero-summary">
            Follow every scheduled and in-play match on its own page without crowding the tournament overview.
          </p>
        </div>
        <div className="matches-hero-tools">
          <div className="matches-settings-shell">
            <button
              type="button"
              className={`matches-settings-button${settingsMenuOpen ? " open" : ""}`}
              onClick={() => setSettingsMenuOpen((current) => !current)}
              aria-expanded={settingsMenuOpen}
              aria-controls="matches-settings-panel"
              aria-label="Open match settings"
              title="Match settings"
            >
              <span className="matches-settings-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.63l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
                </svg>
              </span>
            </button>
            {settingsMenuOpen ? (
              <section id="matches-settings-panel" className="matches-settings-panel">
                <div className="matches-settings-panel-header">
                  <p className="eyebrow">Display</p>
                </div>
                <div className="matches-settings-control">
                  <span className="bracket-inline-label">Player photos</span>
                  <label className="toolbar-switch">
                    <input
                      type="checkbox"
                      checked={showPhotos}
                      onChange={(event) => setShowPhotos(event.target.checked)}
                    />
                    <span className="toolbar-switch-track">
                      <span className="toolbar-switch-thumb" />
                    </span>
                    <span className="toolbar-switch-label">{showPhotos ? "On" : "Off"}</span>
                  </label>
                </div>
              </section>
            ) : null}
          </div>
          <div className="bracket-toolbar matches-toolbar-top">
            <div className="bracket-control bracket-control-year">
              <p className="toolbar-label">Year</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(Number(event.target.value))}
                  aria-label="Select tournament year"
                >
                  {PUBLIC_YEAR_OPTIONS.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bracket-control matches-toolbar-control">
              <p className="toolbar-label">Round</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
                  value={selectedRound.key}
                  onChange={(event) => setSelectedRoundKey(event.target.value)}
                  aria-label="Select round"
                >
                  {snapshot.rounds.map((round) => (
                    <option key={round.key} value={round.key}>
                      {round.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bracket-control matches-toolbar-control matches-toolbar-stat">
              <span className="bracket-inline-label">Live matches</span>
              <strong className="bracket-inline-value">
                {activeFilterCount ? filteredUnplayedMatchCount : unplayedMatchCount}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The tournament is not fully configured yet. Match data is still available while the entrant assignments are completed.
        </p>
      ) : null}

      <section className="section-heading draw-heading">
        <div>
          <p className="eyebrow">Matches</p>
          <h2>{selectedRound.name}</h2>
        </div>
        <div className="matches-heading-actions">
          <button
            type="button"
            className={`matches-filter-button${filterMenuOpen ? " open" : ""}`}
            onClick={() => setFilterMenuOpen((current) => !current)}
            aria-expanded={filterMenuOpen}
            aria-controls="matches-filter-panel"
          >
            <span className="matches-filter-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>Filter</span>
            {activeFilterCount ? <strong>{activeFilterCount} active</strong> : null}
          </button>
        </div>
      </section>

      {filterMenuOpen ? (
        <section id="matches-filter-panel" className="matches-filter-panel">
          <div className="matches-filter-panel-header">
            <p className="eyebrow">Filter Matches</p>
            <button
              type="button"
              className="matches-filter-clear"
              onClick={() => {
                setSelectedEntrantFilters([]);
                setPlayerFilterText("");
                setSelectedCountryFilters([]);
              }}
            >
              Clear
            </button>
          </div>
          <div className="matches-filter-group">
            <label className="matches-filter-label" htmlFor="matches-player-filter">
              Player name
            </label>
            <input
              id="matches-player-filter"
              className="matches-filter-search"
              type="text"
              value={playerFilterText}
              onChange={(event) => setPlayerFilterText(event.target.value)}
              placeholder="Trump, Zhao"
            />
            <p className="matches-filter-help">Use comma-separated names to match multiple players.</p>
          </div>
          <div className="matches-filter-group">
            <p className="matches-filter-label">Entrants</p>
            <div className="matches-filter-options">
              {entrantOptions.map((entrantName) => (
                <button
                  key={entrantName}
                  type="button"
                  className={`matches-filter-option${selectedEntrantFilters.includes(entrantName) ? " active" : ""}`}
                  onClick={() => toggleFilterItem(selectedEntrantFilters, entrantName, setSelectedEntrantFilters)}
                >
                  {entrantName}
                </button>
              ))}
            </div>
          </div>
          <div className="matches-filter-group">
            <p className="matches-filter-label">Country</p>
            <div className="matches-filter-options">
              {countryOptions.map((country) => (
                <button
                  key={country}
                  type="button"
                  className={`matches-filter-option${selectedCountryFilters.includes(country) ? " active" : ""}`}
                  onClick={() => toggleFilterItem(selectedCountryFilters, country, setSelectedCountryFilters)}
                >
                  {country}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="matches-grid">
        {filteredMatches.length ? (
          filteredMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              showPhotos={showPhotos}
              ownershipByPlayerId={ownershipByPlayerId}
            />
          ))
        ) : (
          <article className="match-card empty-round-card">
            <div className="match-meta">
              <span>{selectedRound.name}</span>
              <span>{activeFilterCount ? "No matches for current filters" : "Not populated yet"}</span>
            </div>
            <p className="empty-round-copy">
              {activeFilterCount === 0
                ? "This round has not been populated with match data yet, so players who are still alive are shown as waiting for the round to begin."
                : `No matches in ${selectedRound.name} match the entrant, player, or country filters you selected.`}
            </p>
          </article>
        )}
      </section>
    </main>
  );
}

function BracketPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const autoAdjustedYearRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load(showLoadingState = true) {
      if (showLoadingState) {
        setLoading(true);
      }
      setError("");

      try {
        const nextData = await fetchPool(selectedYear);
        if (!cancelled) {
          if (
            !autoAdjustedYearRef.current
            && nextData.poolConfigured === false
            && PUBLIC_YEAR_OPTIONS.some((year) => year !== selectedYear)
          ) {
            autoAdjustedYearRef.current = true;
            setSelectedYear(PUBLIC_YEAR_OPTIONS.find((year) => year !== selectedYear) || selectedYear);
            return;
          }
          setData(nextData);
          setLastUpdatedAt(new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load bracket data.");
        }
      } finally {
        if (!cancelled && showLoadingState) {
          setLoading(false);
        }
      }
    }

    load();
    const refreshId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load(false);
      }
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, [selectedYear]);

  const derived = useMemo(() => {
    if (!data?.snapshot?.rounds?.length) {
      return null;
    }

    const activeRoundKey = getDefaultRoundKey(data.snapshot);
    const bracketRounds = buildBracketRounds(data.snapshot.rounds, data.competitors || []);
    const maxSlots = 2 ** bracketRounds.length;
    const completedMatches = bracketRounds.reduce(
      (count, round) => count + round.bracketMatches.filter((match) => match.state === "finished").length,
      0,
    );

    return {
      activeRoundKey,
      bracketRounds,
      maxSlots,
      completedMatches,
    };
  }, [data]);

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading {BRAND_SHORT_NAME} bracket...</p></main>;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return <main className="app-shell"><p className="status-banner error">{error || "Bracket data is unavailable."}</p></main>;
  }

  const poolConfigured = data.poolConfigured !== false;
  const bracketUnit = 208;
  const bracketHeight = derived.bracketRounds[0].bracketMatches.length * bracketUnit;

  return (
    <main className="app-shell bracket-page-shell">
      <SiteHeader mode="bracket" poolConfigured={poolConfigured} />

      <section className="bracket-hero-card">
        <div className="bracket-hero-copy">
          <p className="hero-kicker">Entrant bracket</p>
          <h1>{BRAND_SHORT_NAME} Bracket</h1>
          <p className="hero-summary">
            Follow every entrant path through the live draw at a glance.
          </p>
          <p className="bracket-hero-note">
            {lastUpdatedAt
              ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Waiting for live data"}
          </p>
        </div>
        <div className="bracket-toolbar">
          <div className="bracket-control bracket-control-year">
            <p className="toolbar-label">Year</p>
            <label className="toolbar-select-shell">
              <select
                className="toolbar-select"
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                aria-label="Select tournament year"
              >
                {PUBLIC_YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="bracket-control">
            <span className="bracket-inline-label">Active round</span>
            <strong className="bracket-inline-value">{derived.bracketRounds.find((round) => round.key === derived.activeRoundKey)?.name || "Round 1"}</strong>
          </div>
          <div className="bracket-control">
            <span className="bracket-inline-label">Completed</span>
            <strong className="bracket-inline-value">{derived.completedMatches}</strong>
          </div>
          <div className="bracket-control">
            <span className="bracket-inline-label">Assignments</span>
            <strong className={`bracket-inline-value bracket-status-value ${poolConfigured ? "live" : "incomplete"}`}>
              {poolConfigured ? "Live" : "Incomplete"}
            </strong>
          </div>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The tournament is not fully configured yet. Players without an owner are shown as unassigned until they are allocated to an entrant.
        </p>
      ) : null}

      <section className="section-heading">
        <div>
          <p className="eyebrow">Progression View</p>
          <h2>{data.snapshot.eventName}</h2>
        </div>
      </section>

      <section className="bracket-board-shell">
        <div className="bracket-board">
          {derived.bracketRounds.map((round, roundIndex) => (
            <section
              key={round.key}
              className={`bracket-round-column${round.key === derived.activeRoundKey ? " active" : ""}`}
            >
              <div className="bracket-round-header">
                <p className="eyebrow">Round</p>
                <h3>{round.name}</h3>
                <span>{round.bracketMatches.length} matches</span>
              </div>
              <div className="bracket-round-stack" style={{ minHeight: `${bracketHeight}px` }}>
                {round.bracketMatches.map((match, matchIndex) => {
                  const winnerId = match.winnerSide?.id || null;
                  const topOffset = (((2 ** roundIndex) - 1) * bracketUnit) / 2;
                  const top = topOffset + matchIndex * (2 ** roundIndex) * bracketUnit;

                  return (
                    <div
                      key={match.key}
                      className={`bracket-match-slot${roundIndex > 0 ? " has-left-connector" : ""}${roundIndex < derived.bracketRounds.length - 1 ? " has-right-connector" : ""}`}
                      style={{ top: `${top}px` }}
                    >
                      <article className={`bracket-match-card ${match.state}`}>
                        <div className="bracket-match-meta">
                          <div>
                            <span>{match.label}</span>
                            {match.scheduledDate ? <small>{match.scheduledDate.slice(0, 10)}</small> : null}
                          </div>
                          <strong>{match.state === "finished" ? "Final" : match.state === "in-play" ? "Live" : "Waiting"}</strong>
                        </div>

                        {[match.side1, match.side2].map((side) => (
                          <div
                            key={`${match.key}-${side.id}`}
                            className={`bracket-side-row${side.id === winnerId ? " winner" : ""}${side.isPlaceholder ? " placeholder" : ""}${side.isUnassigned ? " unassigned" : ""}`}
                          >
                            <div className="bracket-side-copy">
                              <span className="bracket-entrant-name">
                                <span>{side.entrantName}</span>
                                {(side.winningYears || []).length ? (
                                  <span className="bracket-entrant-crowns" aria-label={`${side.winningYears.length} wins`}>
                                    {side.winningYears.map((year) => (
                                      <img
                                        key={`${side.id}-${year}`}
                                        className="competitor-crown"
                                        src={crownIcon}
                                        alt=""
                                        aria-hidden="true"
                                        title={`Winner ${year}`}
                                      />
                                    ))}
                                  </span>
                                ) : null}
                              </span>
                              <span className="bracket-player-name">{side.playerName}</span>
                            </div>
                            {side.score !== null ? <span className="bracket-side-score">{side.score}</span> : null}
                          </div>
                        ))}
                      </article>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

function WinnersPage() {
  const [entrants, setEntrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetchEntrants();
        if (!cancelled) {
          setEntrants(response.entrants || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load winners.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const winnersByYear = useMemo(() => {
    const winners = [];

    for (const entrant of entrants) {
      for (const year of entrant.winningYears || []) {
        winners.push({
          year,
          entrantId: entrant.id,
          entrantName: entrant.name,
        });
      }
    }

    return winners.sort((left, right) => right.year - left.year);
  }, [entrants]);

  if (loading) {
    return <main className="app-shell"><p className="status-banner">Loading winners...</p></main>;
  }

  if (error) {
    return <main className="app-shell"><p className="status-banner error">{error}</p></main>;
  }

  return (
    <main className="app-shell winners-page-shell">
      <SiteHeader mode="winners" />

      <section className="winners-hero-card">
        <div className="winners-hero-copy">
          <div className="winners-title-row">
            <div className="winners-title-image-shell" aria-hidden="true">
              <img
                className="winners-title-image"
                src={dogsPlayingPool}
                alt=""
              />
              <div className="winners-title-overlay">
                <h1>Past Winners</h1>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-heading winners-section-heading">
        <div>
          <p className="eyebrow">Winner Timeline</p>
          <h2>By Year</h2>
        </div>
      </section>

      {winnersByYear.length ? (
        <section className="winners-grid">
          {winnersByYear.map((winner) => (
            <article key={`${winner.year}-${winner.entrantId}`} className="winner-year-card">
              <p className="eyebrow">Champion</p>
              <div className="winner-year-row">
                <strong>{winner.year}</strong>
                <span className="winner-crown-badge" aria-hidden="true">
                  <img
                    className="competitor-crown"
                    src={crownIcon}
                    alt=""
                  />
                </span>
              </div>
              <h3>{winner.entrantName}</h3>
            </article>
          ))}
        </section>
      ) : (
        <p className="status-banner">No past winners have been recorded yet.</p>
      )}
    </main>
  );
}

function AdminPage() {
  const [authenticated, setAuthenticated] = useState(() => window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true");
  const [adminView, setAdminView] = useState("builder");
  const [selectedAdminYear, setSelectedAdminYear] = useState(ADMIN_DEFAULT_YEAR);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [savingBuilder, setSavingBuilder] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [entrantsLoading, setEntrantsLoading] = useState(false);
  const [savingEntrants, setSavingEntrants] = useState(false);
  const [status, setStatus] = useState("Build the current year's tournament by dragging players into each entrant, then save it.");
  const [error, setError] = useState("");
  const [builder, setBuilder] = useState(null);
  const [entrantRegistry, setEntrantRegistry] = useState([]);
  const [selectedRegistryEntrantId, setSelectedRegistryEntrantId] = useState("");
  const [newEntrantName, setNewEntrantName] = useState("");
  const [showAutoAssignConfirm, setShowAutoAssignConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoAssignTargets, setAutoAssignTargets] = useState({});
  const entrantRegistryLoadedRef = useRef(false);
  const lastSavedEntrantsRef = useRef("[]");

  async function loadBuilder() {
    try {
      setBuilderLoading(true);
      setError("");
      const data = await fetchAdminPoolBuilder(selectedAdminYear);
      setBuilder(data);
      const nextRegistry = data.entrantRegistry || [];
      setEntrantRegistry(nextRegistry);
      lastSavedEntrantsRef.current = JSON.stringify(nextRegistry);
      entrantRegistryLoadedRef.current = true;
    } catch (loadError) {
      setError(loadError.message || "Failed to load the admin builder.");
    } finally {
      setBuilderLoading(false);
    }
  }

  async function loadEntrants() {
    try {
      setEntrantsLoading(true);
      setError("");
      const data = await fetchEntrants();
      const nextRegistry = data.entrants || [];
      setEntrantRegistry(nextRegistry);
      lastSavedEntrantsRef.current = JSON.stringify(nextRegistry);
      entrantRegistryLoadedRef.current = true;
    } catch (loadError) {
      setError(loadError.message || "Failed to load entrants.");
    } finally {
      setEntrantsLoading(false);
    }
  }

  useEffect(() => {
    if (authenticated) {
      loadEntrants();
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadBuilder();
      setSelectedRegistryEntrantId("");
      setShowAutoAssignConfirm(false);
      setShowResetConfirm(false);
      setAutoAssignTargets({});
    }
  }, [authenticated, selectedAdminYear]);

  useEffect(() => {
    if (!authenticated || !entrantRegistryLoadedRef.current || entrantsLoading || savingEntrants) {
      return;
    }

    const currentSerialised = JSON.stringify(entrantRegistry);
    if (currentSerialised === lastSavedEntrantsRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setSavingEntrants(true);
        setError("");
        const payload = {
          entrants: entrantRegistry.map((entrant) => ({
            id: entrant.id,
            name: entrant.name.trim(),
            winningYears: entrant.winningYears || [],
          })),
        };
        const response = await saveEntrants(payload);
        setEntrantRegistry(response.entrants || []);
        lastSavedEntrantsRef.current = JSON.stringify(response.entrants || []);
        setStatus("Entrants saved.");
        await loadBuilder();
      } catch (saveError) {
        setError(saveError.message || "The entrants could not be saved.");
      } finally {
        setSavingEntrants(false);
      }
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [authenticated, entrantRegistry, entrantsLoading, savingEntrants]);

  function handlePasswordSubmit(event) {
    event.preventDefault();
    if (password === ADMIN_PASSWORD) {
      window.sessionStorage.setItem(ADMIN_SESSION_KEY, "true");
      setAuthenticated(true);
      setPassword("");
      setPasswordError("");
      return;
    }

    setPasswordError("Incorrect password.");
  }

  function handleLogout() {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAuthenticated(false);
    setPassword("");
    setPasswordError("");
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      setUploading(true);
      setError("");
      const response = await uploadPool(payload, selectedAdminYear);
      setStatus(`Loaded ${file.name} into ${response.sourceFile}.`);
      await loadBuilder();
      await loadEntrants();
    } catch (uploadError) {
      setError(uploadError.message || "That file could not be uploaded.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const builderDerived = useMemo(() => {
    if (!builder?.snapshot) {
      return null;
    }

    const entrantsById = new Map(builder.snapshot.entrants.map((entry) => [entry.id, entry]));
    const registryById = new Map(entrantRegistry.map((entrant) => [entrant.id, entrant]));
    const competitors = (builder.poolData?.competitors || []).map((competitor) => {
      const registryEntrant = registryById.get(competitor.entrantId);
      return {
        ...competitor,
        entrantId: competitor.entrantId || createEntrantId(),
        name: registryEntrant?.name || competitor.name,
        seeds: (competitor.seedIds || []).map((id) => entrantsById.get(id)).filter(Boolean),
        qualifiers: (competitor.qualifierIds || []).map((id) => entrantsById.get(id)).filter(Boolean),
      };
    });
    const assignedIds = new Set();
    const assignedEntrantIds = new Set();

    for (const competitor of builder.poolData?.competitors || []) {
      if (competitor.entrantId) {
        assignedEntrantIds.add(competitor.entrantId);
      }
      for (const id of competitor.seedIds || []) {
        assignedIds.add(id);
      }
      for (const id of competitor.qualifierIds || []) {
        assignedIds.add(id);
      }
    }

    return {
      entrantsById,
      competitors,
      availableRegistryEntrants: entrantRegistry.filter((entrant) => !assignedEntrantIds.has(entrant.id)),
      availableSeeds: builder.snapshot.seeds.filter((player) => !assignedIds.has(player.id)),
      availableQualifiers: builder.snapshot.qualifiers.filter((player) => !assignedIds.has(player.id)),
    };
  }, [builder, entrantRegistry]);

  const autoAssignDerived = useMemo(() => {
    if (!builder?.snapshot || !builderDerived?.competitors?.length) {
      return null;
    }

    const entrantIds = builderDerived.competitors.map((competitor, index) => competitor.entrantId || `competitor-${index}`);
    const totalSeeds = builder.snapshot.seeds.length;
    const totalQualifiers = builder.snapshot.qualifiers.length;
    const requiresCustomTargets = (
      totalSeeds % entrantIds.length !== 0
      || totalQualifiers % entrantIds.length !== 0
    );
    const suggestedSeedTargets = buildSuggestedTargetCounts(totalSeeds, entrantIds);
    const suggestedQualifierTargets = buildSuggestedTargetCounts(totalQualifiers, entrantIds);

    return {
      entrantIds,
      totalSeeds,
      totalQualifiers,
      requiresCustomTargets,
      suggestedSeedTargets,
      suggestedQualifierTargets,
    };
  }, [builder, builderDerived]);

  const autoAssignProgress = useMemo(() => {
    if (!autoAssignDerived || !builderDerived?.competitors?.length) {
      return null;
    }

    let assignedSeeds = 0;
    let assignedQualifiers = 0;

    for (const [index, competitor] of builderDerived.competitors.entries()) {
      const entrantId = competitor.entrantId || `competitor-${index}`;
      const target = autoAssignTargets[entrantId] || {};
      assignedSeeds += normaliseTargetCountInput(target.seedIds) || 0;
      assignedQualifiers += normaliseTargetCountInput(target.qualifierIds) || 0;
    }

    return {
      assignedSeeds,
      assignedQualifiers,
      totalSeeds: autoAssignDerived.totalSeeds,
      totalQualifiers: autoAssignDerived.totalQualifiers,
    };
  }, [autoAssignDerived, autoAssignTargets, builderDerived]);

  function setCompetitors(updater) {
    setBuilder((current) => ({
      ...current,
      poolData: {
        ...current.poolData,
        competitors: updater(current.poolData.competitors || []),
      },
    }));
  }

  function setRegistry(updater) {
    setEntrantRegistry((current) => updater(current));
  }

  function openAutoAssignWizard() {
    if (!autoAssignDerived || !builderDerived?.competitors?.length) {
      return;
    }

    setError("");
    setShowAutoAssignConfirm(true);
    setAutoAssignTargets(Object.fromEntries(
      builderDerived.competitors.map((competitor, index) => {
        const entrantId = competitor.entrantId || `competitor-${index}`;
        return [entrantId, {
          seedIds: String(autoAssignDerived.suggestedSeedTargets.get(entrantId) || 0),
          qualifierIds: String(autoAssignDerived.suggestedQualifierTargets.get(entrantId) || 0),
        }];
      }),
    ));
  }

  function handleAutoAssignTargetChange(entrantId, bucket, value) {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setAutoAssignTargets((current) => ({
      ...current,
      [entrantId]: {
        ...(current[entrantId] || {}),
        [bucket]: value,
      },
    }));
  }

  function validateAutoAssignTargets() {
    if (!autoAssignDerived || !builderDerived?.competitors?.length) {
      return { valid: false, message: "The tournament builder is still loading." };
    }

    const seedTargets = new Map();
    const qualifierTargets = new Map();
    let seedTotal = 0;
    let qualifierTotal = 0;

    for (const [index, competitor] of builderDerived.competitors.entries()) {
      const entrantId = competitor.entrantId || `competitor-${index}`;
      const target = autoAssignTargets[entrantId] || {};
      const seedCount = normaliseTargetCountInput(target.seedIds);
      const qualifierCount = normaliseTargetCountInput(target.qualifierIds);

      if (seedCount === null || qualifierCount === null) {
        return {
          valid: false,
          message: `Enter valid whole numbers for ${competitor.name}.`,
        };
      }

      seedTargets.set(entrantId, seedCount);
      qualifierTargets.set(entrantId, qualifierCount);
      seedTotal += seedCount;
      qualifierTotal += qualifierCount;
    }

    if (seedTotal !== autoAssignDerived.totalSeeds) {
      return {
        valid: false,
        message: `Seed targets must add up to ${autoAssignDerived.totalSeeds}.`,
      };
    }

    if (qualifierTotal !== autoAssignDerived.totalQualifiers) {
      return {
        valid: false,
        message: `Qualifier targets must add up to ${autoAssignDerived.totalQualifiers}.`,
      };
    }

    return {
      valid: true,
      targetCounts: {
        seedIds: seedTargets,
        qualifierIds: qualifierTargets,
      },
    };
  }

  function handleAddCompetitor(event) {
    event.preventDefault();
    if (!builder?.poolData) {
      setError("The current-year builder is still loading.");
      return;
    }

    if (!selectedRegistryEntrantId) {
      setError("Choose an entrant from the entrants list first.");
      return;
    }

    const selectedEntrant = entrantRegistry.find((entrant) => entrant.id === selectedRegistryEntrantId);
    if (!selectedEntrant) {
      setError("That entrant is no longer available. Refresh the entrants list and try again.");
      return;
    }

    const alreadyAdded = (builder?.poolData?.competitors || []).some(
      (competitor) => competitor.entrantId === selectedEntrant.id,
    );

    if (alreadyAdded) {
      setError("That tournament entrant already exists.");
      return;
    }

    setError("");
    setStatus(`Added ${selectedEntrant.name}. Drag players into their seed and qualifier lists.`);
    setCompetitors((competitors) => [
      ...competitors,
      { entrantId: selectedEntrant.id, name: selectedEntrant.name, seedIds: [], qualifierIds: [] },
    ]);
    setSelectedRegistryEntrantId("");
  }

  function handleRemoveCompetitor(entrantId) {
    setCompetitors((competitors) => competitors.filter(
      (competitor, competitorIndex) => (competitor.entrantId || `competitor-${competitorIndex}`) !== entrantId,
    ));
  }

  function handleAddRegistryEntrant(event) {
    event.preventDefault();
    const trimmedName = newEntrantName.trim();
    if (!trimmedName) {
      setError("Enter an entrant name first.");
      return;
    }

    const nameTaken = entrantRegistry.some((entrant) => entrant.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (nameTaken) {
      setError("That entrant already exists.");
      return;
    }

    setError("");
    setStatus(`Added ${trimmedName} to the entrant registry.`);
    setRegistry((current) => [
      ...current,
      { id: createEntrantId(), name: trimmedName, winningYears: [] },
    ]);
    setNewEntrantName("");
  }

  function handleRegistryNameChange(id, name) {
    setRegistry((current) => current.map((entrant) => (
      entrant.id === id ? { ...entrant, name } : entrant
    )));
  }

  function handleRegistryWinningYearsChange(id, value) {
    setRegistry((current) => current.map((entrant) => (
      entrant.id === id
        ? { ...entrant, winningYears: [...new Set([...(entrant.winningYears || []), value])].sort((left, right) => right - left) }
        : entrant
    )));
  }

  function handleRegistryWinningYearRemove(id, yearToRemove) {
    setRegistry((current) => current.map((entrant) => (
      entrant.id === id
        ? { ...entrant, winningYears: (entrant.winningYears || []).filter((year) => year !== yearToRemove) }
        : entrant
    )));
  }

  function movePlayer(playerId, sourceBucket, target) {
    setBuilder((current) => {
      if (!current?.snapshot) {
        return current;
      }

      const player = current.snapshot.entrants.find((entry) => entry.id === playerId);
      if (!player) {
        return current;
      }

      const targetBucket = target.type === "competitor" ? target.bucket : null;
      if (targetBucket && targetBucket !== sourceBucket) {
        return current;
      }

      const entrantOrder = new Map(current.snapshot.entrants.map((entry, index) => [entry.id, index]));
      const nextCompetitors = (current.poolData?.competitors || []).map((competitor) => ({
        ...competitor,
        seedIds: (competitor.seedIds || []).filter((id) => id !== playerId),
        qualifierIds: (competitor.qualifierIds || []).filter((id) => id !== playerId),
      }));

      if (target.type === "competitor") {
        const targetIndex = nextCompetitors.findIndex((competitor, competitorIndex) => (
          (competitor.entrantId || `competitor-${competitorIndex}`) === target.entrantId
        ));
        if (targetIndex === -1) {
          return current;
        }
        const nextBucket = [...(nextCompetitors[targetIndex][target.bucket] || []), playerId];
        nextBucket.sort((left, right) => (entrantOrder.get(left) ?? 999) - (entrantOrder.get(right) ?? 999));
        nextCompetitors[targetIndex] = {
          ...nextCompetitors[targetIndex],
          [target.bucket]: nextBucket,
        };
      }

      return {
        ...current,
        poolData: {
          ...current.poolData,
          competitors: nextCompetitors,
        },
      };
    });
  }

  function handleDragStart(event, player, bucket) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ playerId: player.id, bucket }));
  }

  function handleDragEnd() {
    // No-op for now; keeping a handler here makes future hover-state work easier.
  }

  function handleDrop(event, target) {
    event.preventDefault();
    try {
      const raw = event.dataTransfer.getData("text/plain");
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw);
      movePlayer(Number(data.playerId), data.bucket, target);
    } catch {
      setError("That drag action could not be processed.");
    }
  }

  function handleRemoveAssignedPlayer(playerId, bucket) {
    movePlayer(playerId, bucket, { type: "pool" });
  }

  function handleAssignAvailablePlayer(entrantId, bucket, playerId) {
    movePlayer(playerId, bucket, { type: "competitor", entrantId, bucket });
  }

  function handleResetYearPicks() {
    if (!builder?.poolData) {
      setError("The tournament builder is still loading.");
      return;
    }

    setError("");
    setBuilder((current) => ({
      ...current,
      poolData: {
        ...current.poolData,
        competitors: (current.poolData?.competitors || []).map((competitor) => ({
          ...competitor,
          seedIds: [],
          qualifierIds: [],
        })),
      },
    }));
    setShowAutoAssignConfirm(false);
    setShowResetConfirm(false);
    setAutoAssignTargets({});
    setStatus(`Cleared all ${selectedAdminYear} picks. Entrants remain in place and can now be reassigned.`);
  }

  async function handleAutoAssignPlayers() {
    if (!builder?.snapshot || !builder?.poolData || !builderDerived) {
      setError("The tournament builder is still loading.");
      return;
    }

    if (!builderDerived.competitors.length) {
      setError("Add tournament entrants before running automatic assignment.");
      return;
    }

    try {
      setAutoAssigning(true);
      setError("");
      let targetCounts = null;
      if (autoAssignDerived?.requiresCustomTargets) {
        const validation = validateAutoAssignTargets();
        if (!validation.valid) {
          setError(validation.message);
          return;
        }
        targetCounts = validation.targetCounts;
      }

      const result = buildAutoAssignment(
        builder.snapshot,
        builder.poolData.competitors || [],
        targetCounts,
      );
      setBuilder((current) => ({
        ...current,
        poolData: {
          ...current.poolData,
          competitors: result.competitors,
        },
      }));
      setShowAutoAssignConfirm(false);
      setStatus(
        `Assigned ${result.assignedSeedCount} seeds and ${result.assignedQualifierCount} qualifiers automatically. First-round opponents were kept apart.`,
      );
    } catch (assignError) {
      setError(assignError.message || "Automatic assignment failed.");
    } finally {
      setAutoAssigning(false);
    }
  }

  async function handleSaveBuilder() {
    if (!builder?.poolData) {
      return;
    }

    try {
      setSavingBuilder(true);
      setError("");
      const payload = {
        year: selectedAdminYear,
        eventName: builder.poolData.eventName ?? `${BRAND_SHORT_NAME} ${selectedAdminYear}`,
        competitors: (builder.poolData.competitors || []).map((competitor) => ({
          entrantId: competitor.entrantId,
          name: competitor.name.trim(),
          seedIds: competitor.seedIds || [],
          qualifierIds: competitor.qualifierIds || [],
        })),
      };

      const response = await saveAdminPoolBuilder(selectedAdminYear, payload);
      setBuilder(response);
      setStatus(`Saved the tournament builder to ${response.sourceFile}.`);
    } catch (saveError) {
      setError(saveError.message || "The tournament builder could not be saved.");
    } finally {
      setSavingBuilder(false);
    }
  }

  if (!authenticated) {
    return (
      <main className="app-shell admin-shell">
        <section className="admin-card admin-login-card">
          <p className="eyebrow">Protected Area</p>
          <h1>Admin</h1>
          <p className="admin-copy">Enter the password to manage picks uploads.</p>
          <form className="admin-form" onSubmit={handlePasswordSubmit}>
            <label className="admin-field" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            {passwordError ? <p className="admin-error">{passwordError}</p> : null}
            <div className="admin-actions">
              <button className="admin-submit" type="submit">Unlock admin</button>
              <Link className="admin-secondary-link" to="/" reloadDocument>Back to tournament</Link>
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell admin-shell">
      <section className="admin-card admin-workspace">
        <div className="admin-topbar">
          <div>
            <p className="eyebrow">Protected Area</p>
            <h1>Admin</h1>
            <p className="admin-copy">Manage yearly picks and the shared entrant list used to track winners over time.</p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={handleLogout}>Lock admin</button>
        </div>

        <div className="admin-menu">
          <button
            type="button"
            className={adminView === "builder" ? "admin-menu-button active" : "admin-menu-button"}
            onClick={() => setAdminView("builder")}
          >
            Tournament builder
          </button>
          <button
            type="button"
            className={adminView === "entrants" ? "admin-menu-button active" : "admin-menu-button"}
            onClick={() => setAdminView("entrants")}
          >
            Entrants
          </button>
        </div>

        <div className={adminView === "builder" ? "admin-builder-toolbar" : "admin-builder-toolbar entrants-view"}>
          {adminView === "builder" ? (
            <>
              <div className="admin-stat-card">
                <p className="toolbar-label">Builder year</p>
                <label className="toolbar-select-shell admin-select-shell">
                  <select
                    className="toolbar-select"
                    value={selectedAdminYear}
                    onChange={(event) => setSelectedAdminYear(Number(event.target.value))}
                    aria-label="Select admin year"
                  >
                    {ADMIN_YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Available seeds</p>
                <p className="toolbar-value">{builderDerived?.availableSeeds.length ?? 0}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Available qualifiers</p>
                <p className="toolbar-value">{builderDerived?.availableQualifiers.length ?? 0}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Tournament entrants</p>
                <p className="toolbar-value">{builder?.poolData?.competitors?.length ?? 0}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Tracked winners</p>
                <p className="toolbar-value">{entrantRegistry.reduce((count, entrant) => count + (entrant.winningYears?.length || 0), 0)}</p>
              </div>
            </>
          ) : (
            <>
              <div className="admin-stat-card">
                <p className="toolbar-label">Total entrants</p>
                <p className="toolbar-value">{entrantRegistry.length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Entrants with wins</p>
                <p className="toolbar-value">{entrantRegistry.filter((entrant) => (entrant.winningYears?.length || 0) > 0).length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Tracked winners</p>
                <p className="toolbar-value">{entrantRegistry.reduce((count, entrant) => count + (entrant.winningYears?.length || 0), 0)}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Open winner years</p>
                <p className="toolbar-value">
                  {WINNER_YEAR_OPTIONS.filter((year) => !entrantRegistry.some((entrant) => (entrant.winningYears || []).includes(year))).length}
                </p>
              </div>
            </>
          )}
        </div>

        {error ? <p className="status-banner error">{error}</p> : null}
        {adminView === "builder" ? <p className="status-banner">{status}</p> : null}

        {adminView === "builder" ? (
        <section className="admin-builder-panel">
          <div className="admin-builder-header">
            <div>
              <p className="eyebrow">Tournament Builder</p>
              <h2>Create tournament entrants and assign current-year players</h2>
              <p className="admin-copy">Saved entrants are reused as the starting list for future years.</p>
            </div>
            <div className="admin-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  if (showAutoAssignConfirm) {
                    setShowAutoAssignConfirm(false);
                    setAutoAssignTargets({});
                    setError("");
                    return;
                  }
                  setShowResetConfirm(false);
                  openAutoAssignWizard();
                }}
                disabled={builderLoading || autoAssigning || !builderDerived?.competitors.length}
              >
                {showAutoAssignConfirm ? "Close auto-assign" : "Auto-assign players"}
              </button>
              <button
                type="button"
                className="admin-secondary-button admin-danger-button"
                onClick={() => {
                  setError("");
                  setShowAutoAssignConfirm(false);
                  setAutoAssignTargets({});
                  setShowResetConfirm((current) => !current);
                }}
                disabled={builderLoading || autoAssigning || !builderDerived?.competitors.length}
              >
                {showResetConfirm ? "Close reset" : "Reset year picks"}
              </button>
              <button type="button" className="admin-secondary-button" onClick={loadBuilder} disabled={builderLoading}>
                {builderLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" className="admin-submit" onClick={handleSaveBuilder} disabled={savingBuilder || builderLoading}>
                {savingBuilder ? "Saving..." : "Save tournament"}
              </button>
            </div>
          </div>

          {showAutoAssignConfirm ? (
            <section className="admin-auto-assign-panel">
              <div>
                <p className="eyebrow">Auto-Assign Wizard</p>
                <h3>Randomly distribute the current draw</h3>
                <p className="admin-copy">
                  This clears the current seed and qualifier assignments for {selectedAdminYear}, then redistributes all named players across the existing entrants.
                  The wizard keeps round-one opponents away from the same entrant and balances the draw as evenly as possible.
                </p>
              </div>
              <div className="admin-auto-assign-stats">
                <span>{autoAssignDerived?.totalSeeds ?? 0} seeds</span>
                <span>{autoAssignDerived?.totalQualifiers ?? 0} qualifiers</span>
                <span>{builderDerived?.competitors?.length ?? 0} entrants</span>
              </div>
              {autoAssignDerived?.requiresCustomTargets ? (
                <div className="admin-auto-assign-targets">
                  <p className="admin-copy">
                    This year cannot be split evenly, so enter how many seeds and qualifiers each entrant should receive before the wizard runs.
                  </p>
                  <div className="admin-auto-assign-progress">
                    <span>
                      Seeds assigned: <strong>{autoAssignProgress?.assignedSeeds ?? 0}</strong> / {autoAssignProgress?.totalSeeds ?? 0}
                    </span>
                    <span>
                      Qualifiers assigned: <strong>{autoAssignProgress?.assignedQualifiers ?? 0}</strong> / {autoAssignProgress?.totalQualifiers ?? 0}
                    </span>
                  </div>
                  <div className="admin-auto-assign-target-grid">
                    {builderDerived.competitors.map((competitor, index) => {
                      const entrantId = competitor.entrantId || `competitor-${index}`;
                      const target = autoAssignTargets[entrantId] || {};
                      return (
                        <article key={entrantId} className="admin-auto-assign-target-card">
                          <h4>{competitor.name}</h4>
                          <label className="admin-field" htmlFor={`auto-seeds-${entrantId}`}>Seeds</label>
                          <input
                            id={`auto-seeds-${entrantId}`}
                            className="admin-auto-assign-input"
                            inputMode="numeric"
                            value={target.seedIds ?? ""}
                            onChange={(event) => handleAutoAssignTargetChange(entrantId, "seedIds", event.target.value)}
                          />
                          <label className="admin-field" htmlFor={`auto-qualifiers-${entrantId}`}>Qualifiers</label>
                          <input
                            id={`auto-qualifiers-${entrantId}`}
                            className="admin-auto-assign-input"
                            inputMode="numeric"
                            value={target.qualifierIds ?? ""}
                            onChange={(event) => handleAutoAssignTargetChange(entrantId, "qualifierIds", event.target.value)}
                          />
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => {
                    setShowAutoAssignConfirm(false);
                    setAutoAssignTargets({});
                  }}
                  disabled={autoAssigning}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-submit"
                  onClick={handleAutoAssignPlayers}
                  disabled={autoAssigning}
                >
                  {autoAssigning ? "Assigning..." : "Are you sure?"}
                </button>
              </div>
            </section>
          ) : null}

          {showResetConfirm ? (
            <section className="admin-reset-panel">
              <div>
                <p className="eyebrow">Reset Picks</p>
                <h3>Clear the {selectedAdminYear} assignments</h3>
                <p className="admin-copy">
                  This removes all current seed and qualifier picks for the selected year, but keeps the entrant list itself in place.
                  You can then reassign players manually or run the auto-assign wizard again.
                </p>
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-danger-button"
                  onClick={handleResetYearPicks}
                >
                  Are you sure?
                </button>
              </div>
            </section>
          ) : null}

          <form className="admin-add-form" onSubmit={handleAddCompetitor}>
            <div className="admin-add-field">
              <label className="admin-field" htmlFor="pool-entrant-select">Add entrant from registry</label>
              <label className="toolbar-select-shell admin-select-shell" htmlFor="pool-entrant-select">
                <select
                  id="pool-entrant-select"
                  className="toolbar-select"
                  value={selectedRegistryEntrantId}
                  onChange={(event) => setSelectedRegistryEntrantId(event.target.value)}
                  disabled={!builder}
                >
                  <option value="">Choose entrant</option>
                  {(builderDerived?.availableRegistryEntrants || []).map((entrant) => (
                    <option key={entrant.id} value={entrant.id}>
                      {entrant.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-add-actions">
              <button type="submit" className="admin-submit" disabled={!builder}>Add entrant</button>
            </div>
          </form>

          {builderLoading && !builder ? (
            <p className="admin-copy">Loading current-year players...</p>
          ) : builderDerived ? (
            <div className="admin-builder-grid">
              <aside className="admin-pool-column">
                <AdminPlayerLane
                  title="Available seeds"
                  bucket="seedIds"
                  players={builderDerived.availableSeeds}
                  emptyCopy="All seeds have been assigned."
                  onDrop={(event, bucket) => handleDrop(event, { type: "pool", bucket })}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
                <AdminPlayerLane
                  title="Available qualifiers"
                  bucket="qualifierIds"
                  players={builderDerived.availableQualifiers}
                  emptyCopy="All qualifiers have been assigned."
                  onDrop={(event, bucket) => handleDrop(event, { type: "pool", bucket })}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              </aside>

              <section className="admin-competitors-column">
                {builderDerived.competitors.length ? (
                  builderDerived.competitors.map((competitor) => (
                    <article key={competitor.entrantId} className="admin-competitor-card">
                      <div className="admin-competitor-card-header">
                        <h3 className="admin-competitor-title">{competitor.name}</h3>
                        <button
                          type="button"
                          className="admin-player-remove"
                          onClick={() => handleRemoveCompetitor(competitor.entrantId)}
                        >
                          Remove entrant
                        </button>
                      </div>
                      <div className="admin-competitor-lanes">
                        <AdminPlayerLane
                          title="Seed picks"
                          bucket="seedIds"
                          players={competitor.seeds}
                          emptyCopy="Drop seeds here."
                          onDrop={(event, bucket) => handleDrop(event, { type: "competitor", entrantId: competitor.entrantId, bucket })}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onRemove={handleRemoveAssignedPlayer}
                          assignablePlayers={builderDerived.availableSeeds}
                          onAssign={(playerId, bucket) => handleAssignAvailablePlayer(competitor.entrantId, bucket, playerId)}
                          assignLabel="Add available seed"
                        />
                        <AdminPlayerLane
                          title="Qualifier picks"
                          bucket="qualifierIds"
                          players={competitor.qualifiers}
                          emptyCopy="Drop qualifiers here."
                          onDrop={(event, bucket) => handleDrop(event, { type: "competitor", entrantId: competitor.entrantId, bucket })}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onRemove={handleRemoveAssignedPlayer}
                          assignablePlayers={builderDerived.availableQualifiers}
                          onAssign={(playerId, bucket) => handleAssignAvailablePlayer(competitor.entrantId, bucket, playerId)}
                          assignLabel="Add available qualifier"
                        />
                      </div>
                    </article>
                  ))
                ) : (
                  <article className="admin-competitor-card admin-empty-competitor-card">
                    <p className="admin-copy">Add a tournament entrant to start assigning the current year's players.</p>
                  </article>
                )}
              </section>
            </div>
          ) : null}
        </section>
        ) : (
        <section className="admin-builder-panel">
          <div className="admin-builder-header">
            <div>
              <p className="eyebrow">Entrants</p>
              <h2>Edit entrant names and winning years</h2>
              <p className="admin-copy">Changes save automatically. Each year can only have one winner across the entire entrant list.</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="admin-secondary-button" onClick={loadEntrants} disabled={entrantsLoading}>
                {entrantsLoading ? "Refreshing..." : "Refresh"}
              </button>
              <div className="admin-saving-indicator">{savingEntrants ? "Saving..." : "Autosave on"}</div>
            </div>
          </div>

          <form className="admin-add-form admin-entrant-form" onSubmit={handleAddRegistryEntrant}>
            <div className="admin-add-field">
              <label className="admin-field" htmlFor="new-registry-entrant-name">New entrant</label>
              <input
                id="new-registry-entrant-name"
                value={newEntrantName}
                onChange={(event) => setNewEntrantName(event.target.value)}
                placeholder="Enter a name"
              />
            </div>
            <div className="admin-add-actions">
              <button type="submit" className="admin-submit">Add entrant</button>
            </div>
          </form>

          {entrantsLoading && !entrantRegistry.length ? (
            <p className="admin-copy">Loading entrants...</p>
          ) : (
            <div className="admin-entrants-editor">
              {entrantRegistry.map((entrant) => (
                <article key={entrant.id} className="admin-entrant-row">
                  <div className="admin-entrant-main">
                    <div className="admin-entrant-heading">
                      <label className="admin-field" htmlFor={`entrant-name-${entrant.id}`}>Entrant name</label>
                      <span className="admin-entrant-summary">
                        {(entrant.winningYears || []).length
                          ? `${entrant.winningYears.length} win${entrant.winningYears.length === 1 ? "" : "s"}`
                          : "No wins yet"}
                      </span>
                    </div>
                    <input
                      id={`entrant-name-${entrant.id}`}
                      className="admin-competitor-input"
                      value={entrant.name}
                      onChange={(event) => handleRegistryNameChange(entrant.id, event.target.value)}
                    />
                  </div>
                  <div className="admin-entrant-wins">
                    <label className="admin-field" htmlFor={`entrant-years-${entrant.id}`}>Winning years</label>
                    <div className="admin-winning-years">
                      <div className="admin-winning-years-list">
                        {(entrant.winningYears || []).length ? (
                          (entrant.winningYears || []).map((year) => (
                            <button
                              key={year}
                              type="button"
                              className="admin-winning-year-chip"
                              onClick={() => handleRegistryWinningYearRemove(entrant.id, year)}
                            >
                              {year} x
                            </button>
                          ))
                        ) : (
                          <span className="admin-empty-copy">No winning years yet.</span>
                        )}
                      </div>
                      <label className="toolbar-select-shell admin-select-shell" htmlFor={`entrant-years-${entrant.id}`}>
                        <select
                          id={`entrant-years-${entrant.id}`}
                          className="toolbar-select"
                          value=""
                          onChange={(event) => handleRegistryWinningYearsChange(entrant.id, Number(event.target.value))}
                        >
                          <option value="">Add winning year</option>
                          {WINNER_YEAR_OPTIONS
                            .filter((year) => !entrantRegistry.some((otherEntrant) => (
                              otherEntrant.id !== entrant.id && (otherEntrant.winningYears || []).includes(year)
                            )))
                            .filter((year) => !(entrant.winningYears || []).includes(year))
                            .map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        )}

        <div className="admin-actions">
          <Link className="admin-secondary-link" to="/" reloadDocument>Back to tournament</Link>
        </div>
      </section>
    </main>
  );
}

function ProtectedAdminRoute() {
  const authenticated = window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
  return authenticated ? <AdminPage /> : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/entrants" element={<EntrantsPage />} />
      <Route path="/matches" element={<MatchesPage />} />
      <Route path="/bracket" element={<BracketPage />} />
      <Route path="/winners" element={<WinnersPage />} />
      <Route path="/admin" element={<ProtectedAdminRoute />} />
      <Route path="/admin/login" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
