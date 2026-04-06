import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import crownIcon from "../../res/crown.png";
import dogsPlayingPool from "../../res/dogsplayingpool.webp";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5174";
const PUBLIC_DEFAULT_YEAR = new Date().getFullYear();
const PUBLIC_YEAR_OPTIONS = PUBLIC_DEFAULT_YEAR >= 2027
  ? Array.from({ length: 6 }, (_, index) => PUBLIC_DEFAULT_YEAR - index)
  : [2026, 2025];
const ADMIN_DEFAULT_YEAR = new Date().getFullYear();
const ADMIN_YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => ADMIN_DEFAULT_YEAR - index);
const WINNER_YEAR_OPTIONS = Array.from({ length: ADMIN_DEFAULT_YEAR - 2019 + 1 }, (_, index) => ADMIN_DEFAULT_YEAR - index);
const ADMIN_PASSWORD = "painting";
const ADMIN_SESSION_KEY = "snooker-admin-authenticated";

function createEntrantId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `entrant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
      throw new Error(`The API returned HTML instead of JSON. Restart the backend on ${API_BASE} and make sure VITE_API_BASE points to the API server.`);
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

function PlayerIdentity({ player, compact = false, showPhoto = true }) {
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
        <strong>{player.name}</strong>
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
        <span>{players.filter((player) => !player.eliminated).length} still alive</span>
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

function SiteHeader({ mode = "home", poolConfigured = false }) {
  return (
    <header className="site-nav">
      <Link className="site-brand" to="/">
        <span className="site-brand-mark">S</span>
        <span className="site-brand-copy">
          <strong>The Pellegrino Classic</strong>
          <small>Snooker tournament tracker</small>
        </span>
      </Link>
      <nav className="site-menu" aria-label="Primary">
        {mode === "home" ? (
          <>
            <a className="site-menu-link" href="#overview">Overview</a>
            {poolConfigured ? <a className="site-menu-link" href="#entrants">Entrants</a> : null}
            <a className="site-menu-link" href="#matches">Matches</a>
            <Link className="site-menu-link" to="/bracket">Bracket</Link>
            <Link className="site-menu-link" to="/winners">Winners</Link>
          </>
        ) : (
          <>
            <Link className="site-menu-link" to="/">Tournament</Link>
            <Link className={`site-menu-link${mode === "bracket" ? " current" : ""}`} to="/bracket">Bracket</Link>
            <Link className={`site-menu-link${mode === "winners" ? " current" : ""}`} to="/winners">Winners</Link>
          </>
        )}
        <Link className="admin-link" to="/admin">Admin</Link>
      </nav>
    </header>
  );
}

function isActiveTournamentMatch(match) {
  return !isPlaceholderMatchPlayer(match?.player1) && !isPlaceholderMatchPlayer(match?.player2);
}

function isOpenTournamentMatch(match) {
  return isActiveTournamentMatch(match) && (match.unfinished || !match.winnerId);
}

function MatchCard({ match, showPhotos }) {
  const metaBits = [
    match.tableNo ? `Table ${match.tableNo}` : null,
    match.startDate ? `Start ${match.startDate.slice(0, 10)}` : null,
    match.endDate ? `End ${match.endDate.slice(0, 10)}` : null,
  ].filter(Boolean);

  const renderSide = (player, won) => (
    <div className={won ? "match-side winner" : "match-side loser"}>
      <PlayerIdentity player={player} compact showPhoto={showPhotos} />
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

function HomePage() {
  const [data, setData] = useState(null);
  const [publicEntrants, setPublicEntrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPhotos, setShowPhotos] = useState(true);
  const [selectedYear, setSelectedYear] = useState(PUBLIC_DEFAULT_YEAR);
  const [selectedRoundKey, setSelectedRoundKey] = useState("");
  const [competitorsSectionExpanded, setCompetitorsSectionExpanded] = useState(true);
  const [expandedCompetitors, setExpandedCompetitors] = useState({});
  const [matchesExpanded, setMatchesExpanded] = useState(true);
  const autoSelectedRoundYearRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [nextData, entrantsResponse] = await Promise.all([
          fetchPool(selectedYear),
          fetchEntrants(),
        ]);
        if (!cancelled) {
          setData(nextData);
          setPublicEntrants(entrantsResponse.entrants || []);
          setExpandedCompetitors({});
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
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
  }, [selectedYear]);

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
    const nextRound = snapshot.rounds.find((round) => round.order === selectedRound.order + 1) || null;
    const nextRoundInPlay = Boolean(
      nextRound?.matches.some((match) => isOpenTournamentMatch(match)),
    );
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
    const openMatchCount = selectedRound.matches.filter((match) => isOpenTournamentMatch(match)).length;

    return {
      selectedRound,
      nextRound,
      nextRoundInPlay,
      aliveEntrantsCount,
      openMatchCount,
      decoratedCompetitors,
    };
  }, [data, publicEntrants, selectedRoundKey]);

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading The Pellegrino Classic {selectedYear}...</p></main>;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return <main className="app-shell"><p className="status-banner error">{error || "Tournament data is unavailable."}</p></main>;
  }

  const { snapshot } = data;
  const { selectedRound, nextRound, nextRoundInPlay, aliveEntrantsCount, openMatchCount, decoratedCompetitors } = derived;
  const poolConfigured = data.poolConfigured !== false;

  return (
    <main className="app-shell">
      <SiteHeader mode="home" poolConfigured={poolConfigured} />

      <section className="hero-card" id="overview">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-grid" />
        <div className="hero-header">
          <div className="hero-copy">
            <p className="hero-kicker">Live tournament dashboard</p>
            <h1>
              The Pellegrino Classic
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
              Track every entrant, see who is still alive, and jump straight into the active round without digging through a spreadsheet-style layout.
            </p>
            <div className="hero-actions">
              {poolConfigured ? <a className="admin-pill-link" href="#entrants">View entrants</a> : null}
              <Link className="admin-pill-link subtle" to="/bracket">Open bracket</Link>
              <a className="admin-pill-link subtle" href="#matches">Open matches</a>
            </div>
          </div>
        </div>
        <div className="hero-image-shell">
          <img className="hero-image" src={dogsPlayingPool} alt="Dogs playing pool" />
        </div>
      </section>

      <section className="toolbar-card">
        <div className="toolbar-meta">
          <div>
            <p className="toolbar-label">Selected round</p>
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
            {nextRoundInPlay ? (
              <p className="toolbar-note">{nextRound.name} is in play</p>
            ) : null}
          </div>
          <div>
            <p className="toolbar-label">Players alive</p>
            <p className="toolbar-value">{aliveEntrantsCount}</p>
          </div>
          <div>
            <p className="toolbar-label">Matches this round</p>
            <p className="toolbar-value">{openMatchCount}</p>
          </div>
          <div>
            <p className="toolbar-label">Player photos</p>
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
          The {selectedYear} tournament is not fully configured yet. Match data is still available below, and you can finish setting up the tournament from admin.
        </p>
      ) : null}

      {poolConfigured ? (
        <>
          <section className="section-heading" id="entrants">
            <div className="collapsible-title-row">
              <div>
                <p className="eyebrow">Tournament standings</p>
                <h2>Entrants</h2>
              </div>
              <ChevronToggle
                expanded={competitorsSectionExpanded}
                onToggle={() => setCompetitorsSectionExpanded((current) => !current)}
                label="Entrants"
                className="section-heading-toggle"
              />
            </div>
          </section>

          {competitorsSectionExpanded ? (
            <section className="competitor-grid">
              {decoratedCompetitors.map((competitor) => {
                const liveCount = [...competitor.seeds, ...competitor.qualifiers].filter((player) => !player.eliminated).length;
                const totalCount = competitor.seeds.length + competitor.qualifiers.length;
                const isExpanded = expandedCompetitors[competitor.name] ?? true;
                return (
                  <article key={competitor.name} className="competitor-card">
                    <div className="competitor-header">
                      <div className="competitor-heading">
                        <p className="eyebrow">Tournament entrant</p>
                        <div className="collapsible-title-row">
                          <div className="competitor-title-wrap">
                            <h2>{competitor.name}</h2>
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
                      </div>
                      <div className="live-pill">{liveCount} alive</div>
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
        </>
      ) : null}

      <section className="section-heading draw-heading" id="matches">
        <div className="collapsible-title-row">
          <div>
            <p className="eyebrow">Matches</p>
            <h2>{selectedRound.name}</h2>
          </div>
          <ChevronToggle
            expanded={matchesExpanded}
            onToggle={() => setMatchesExpanded((current) => !current)}
            label={selectedRound.name}
            className="section-heading-toggle"
          />
        </div>
      </section>

      {matchesExpanded ? (
        <section className="matches-grid">
          {selectedRound.matches.length ? (
            selectedRound.matches.map((match) => (
              <MatchCard key={match.id} match={match} showPhotos={showPhotos} />
            ))
          ) : (
            <article className="match-card empty-round-card">
              <div className="match-meta">
                <span>{selectedRound.name}</span>
                <span>Not populated yet</span>
              </div>
              <p className="empty-round-copy">
                This round has not been populated with match data yet, so players who are still alive are shown as waiting for the round to begin.
              </p>
            </article>
          )}
        </section>
      ) : (
        <section className="matches-collapsed">
          <p>
            {selectedRound.matches.length
              ? `${selectedRound.matchCount} matches are hidden for a cleaner overview.`
              : "This round does not have match data populated yet."}
          </p>
        </section>
      )}
    </main>
  );
}

function BracketPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState(PUBLIC_DEFAULT_YEAR);
  const autoAdjustedYearRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
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
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load bracket data.");
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
  }, [selectedYear]);

  const derived = useMemo(() => {
    if (!data?.snapshot?.rounds?.length) {
      return null;
    }

    const bracketRounds = buildBracketRounds(data.snapshot.rounds, data.competitors || []);
    const maxSlots = 2 ** bracketRounds.length;
    const completedMatches = bracketRounds.reduce(
      (count, round) => count + round.bracketMatches.filter((match) => match.state === "finished").length,
      0,
    );

    return {
      bracketRounds,
      maxSlots,
      completedMatches,
    };
  }, [data]);

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading {selectedYear} bracket...</p></main>;
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
          <h1>Pellegrino Bracket</h1>
          <p className="hero-summary">
            Track entrant-versus-entrant paths through every round.
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
            <section key={round.key} className="bracket-round-column">
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
  const [entrantsLoading, setEntrantsLoading] = useState(false);
  const [savingEntrants, setSavingEntrants] = useState(false);
  const [status, setStatus] = useState("Build the current year's tournament by dragging players into each entrant, then save it.");
  const [error, setError] = useState("");
  const [builder, setBuilder] = useState(null);
  const [entrantRegistry, setEntrantRegistry] = useState([]);
  const [selectedRegistryEntrantId, setSelectedRegistryEntrantId] = useState("");
  const [newEntrantName, setNewEntrantName] = useState("");
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

  async function handleSaveBuilder() {
    if (!builder?.poolData) {
      return;
    }

    try {
      setSavingBuilder(true);
      setError("");
      const payload = {
        year: selectedAdminYear,
        eventName: builder.poolData.eventName ?? `World Championship ${selectedAdminYear}`,
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
              <button type="button" className="admin-secondary-button" onClick={loadBuilder} disabled={builderLoading}>
                {builderLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" className="admin-submit" onClick={handleSaveBuilder} disabled={savingBuilder || builderLoading}>
                {savingBuilder ? "Saving..." : "Save tournament"}
              </button>
            </div>
          </div>

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
      <Route path="/bracket" element={<BracketPage />} />
      <Route path="/winners" element={<WinnersPage />} />
      <Route path="/admin" element={<ProtectedAdminRoute />} />
      <Route path="/admin/login" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
