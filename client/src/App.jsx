import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import dogsPlayingPool from "../../res/dogsplayingpool.webp";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5174";
const PUBLIC_DEFAULT_YEAR = new Date().getFullYear();
const PUBLIC_YEAR_OPTIONS = Array.from({ length: 8 }, (_, index) => PUBLIC_DEFAULT_YEAR - index);
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

function PickList({ title, players }) {
  return (
    <section className="pick-group">
      <div className="pick-group-header">
        <h3>{title}</h3>
        <span>{players.filter((player) => !player.eliminated).length} still alive</span>
      </div>
      <ul className="pick-list">
        {players.map((player) => (
          <li key={player.id} className={player.eliminated ? "pick-row eliminated" : "pick-row"}>
            <div>
              <strong>{player.name}</strong>
              <small>{player.nationality || "Unknown"}</small>
            </div>
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

function MatchCard({ match }) {
  const renderSide = (player, won) => (
    <div className={won ? "match-side winner" : "match-side loser"}>
      <span>{player.name}</span>
      <strong>{player.score}</strong>
    </div>
  );

  return (
    <article className="match-card">
      <div className="match-meta">
        <span>Match {match.number}</span>
        <span>{match.unfinished ? "In play" : match.scheduledDate.slice(0, 10)}</span>
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
}) {
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

function HomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = useState(PUBLIC_DEFAULT_YEAR);
  const [selectedRoundKey, setSelectedRoundKey] = useState("");
  const [competitorsSectionExpanded, setCompetitorsSectionExpanded] = useState(true);
  const [expandedCompetitors, setExpandedCompetitors] = useState({});
  const [matchesExpanded, setMatchesExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextData = await fetchPool(selectedYear);
        if (!cancelled) {
          setData(nextData);
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

    const roundExists = data.snapshot.rounds.some((round) => round.key === selectedRoundKey);
    if (!roundExists) {
      setSelectedRoundKey(data.snapshot.rounds[0].key);
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
    const selectedRound = snapshot.rounds.find((round) => round.key === selectedRoundKey) || snapshot.rounds[0];
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
      seeds: competitor.seeds.map((player) => entrantsById.get(player.id)),
      qualifiers: competitor.qualifiers.map((player) => entrantsById.get(player.id)),
    }));

    return {
      selectedRound,
      decoratedCompetitors,
    };
  }, [data, selectedRoundKey]);

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading {selectedYear} World Championship pool...</p></main>;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return <main className="app-shell"><p className="status-banner error">{error || "Pool data is unavailable."}</p></main>;
  }

  const { snapshot } = data;
  const { selectedRound, decoratedCompetitors } = derived;
  const isLive = snapshot.dataSource === "live";
  const sourceLabel = isLive
    ? "Live data"
    : snapshot.dataSource === "static-fallback"
      ? "Cached fallback"
      : "Schedule pending";
  const poolConfigured = data.poolConfigured !== false;

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-grid" />
        <div className="hero-header">
          <h1>
            World Championship
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
          <Link className="admin-link" to="/admin">Admin</Link>
        </div>
        <div className="hero-image-shell">
          <img className="hero-image" src={dogsPlayingPool} alt="Dogs playing pool" />
        </div>
      </section>

      <section className="toolbar-card">
        <div className="toolbar-meta">
          <div>
            <p className="toolbar-label">Data source</p>
            <div className={isLive ? "source-indicator live" : "source-indicator cached"}>
              {sourceLabel}
            </div>
          </div>
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
          </div>
          <div>
            <p className="toolbar-label">Players alive</p>
            <p className="toolbar-value">{selectedRound.entrantsLeft}</p>
          </div>
          <div>
            <p className="toolbar-label">Matches this round</p>
            <p className="toolbar-value">{selectedRound.matchCount}</p>
          </div>
        </div>
        <div className="toolbar-action">
          <p className="toolbar-label">Uploads</p>
          <Link className="admin-pill-link" to="/admin">Manage in admin</Link>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The {selectedYear} pool is not fully configured yet. Match data is still available below, and you can finish setting up the pool from admin.
        </p>
      ) : null}

      {poolConfigured ? (
        <>
          <section className="section-heading">
            <div className="collapsible-title-row">
              <div>
                <p className="eyebrow">Competitors</p>
                <h2>Picks alive after {selectedRound.name}</h2>
              </div>
              <ChevronToggle
                expanded={competitorsSectionExpanded}
                onToggle={() => setCompetitorsSectionExpanded((current) => !current)}
                label={`Picks alive after ${selectedRound.name}`}
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
                        <p className="eyebrow">Pool entrant</p>
                        <div className="collapsible-title-row">
                          <h2>{competitor.name}</h2>
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
                        <PickList title="Seeds" players={competitor.seeds} />
                        <PickList title="Qualifiers" players={competitor.qualifiers} />
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

      <section className="section-heading draw-heading">
        <div className="collapsible-title-row">
          <div>
            <p className="eyebrow">{selectedRound.shortLabel}</p>
            <h2>{selectedRound.name} results</h2>
          </div>
          <ChevronToggle
            expanded={matchesExpanded}
            onToggle={() => setMatchesExpanded((current) => !current)}
            label={`${selectedRound.name} results`}
            className="section-heading-toggle"
          />
        </div>
      </section>

      {matchesExpanded ? (
        <section className="matches-grid">
          {selectedRound.matches.length ? (
            selectedRound.matches.map((match) => (
              <MatchCard key={match.id} match={match} />
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
  const [status, setStatus] = useState("Build the current year's pool by dragging players into each entrant, then save it.");
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
      setError("That pool entrant already exists.");
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
      setStatus(`Saved the pool builder to ${response.sourceFile}.`);
    } catch (saveError) {
      setError(saveError.message || "The pool builder could not be saved.");
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
              <Link className="admin-secondary-link" to="/">Back to pool</Link>
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
            Pool builder
          </button>
          <button
            type="button"
            className={adminView === "entrants" ? "admin-menu-button active" : "admin-menu-button"}
            onClick={() => setAdminView("entrants")}
          >
            Entrants
          </button>
        </div>

        <div className="admin-builder-toolbar">
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
            <p className="toolbar-label">Pool entrants</p>
            <p className="toolbar-value">{builder?.poolData?.competitors?.length ?? 0}</p>
          </div>
          <div className="admin-stat-card">
            <p className="toolbar-label">Tracked winners</p>
            <p className="toolbar-value">{entrantRegistry.reduce((count, entrant) => count + (entrant.winningYears?.length || 0), 0)}</p>
          </div>
        </div>

        {error ? <p className="status-banner error">{error}</p> : <p className="status-banner">{status}</p>}

        {adminView === "builder" ? (
        <section className="admin-builder-panel">
          <div className="admin-builder-header">
            <div>
              <p className="eyebrow">Pool Builder</p>
              <h2>Create pool entrants and assign current-year players</h2>
              <p className="admin-copy">Saved entrants are reused as the starting list for future years.</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="admin-secondary-button" onClick={loadBuilder} disabled={builderLoading}>
                {builderLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" className="admin-submit" onClick={handleSaveBuilder} disabled={savingBuilder || builderLoading}>
                {savingBuilder ? "Saving..." : "Save pool"}
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
                        />
                      </div>
                    </article>
                  ))
                ) : (
                  <article className="admin-competitor-card admin-empty-competitor-card">
                    <p className="admin-copy">Add a pool entrant to start assigning the current year's players.</p>
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

          <form className="admin-add-form" onSubmit={handleAddRegistryEntrant}>
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
                  <div>
                    <label className="admin-field" htmlFor={`entrant-name-${entrant.id}`}>Entrant name</label>
                    <input
                      id={`entrant-name-${entrant.id}`}
                      className="admin-competitor-input"
                      value={entrant.name}
                      onChange={(event) => handleRegistryNameChange(entrant.id, event.target.value)}
                    />
                  </div>
                  <div>
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

        <div className="admin-upload-panel">
          <p className="toolbar-label">Picks upload</p>
          <label className="upload-button">
            <input type="file" accept="application/json" onChange={handleUpload} disabled={uploading} />
            {uploading ? "Uploading..." : "Upload a new picks file"}
          </label>
        </div>

        <div className="admin-actions">
          <Link className="admin-secondary-link" to="/">Back to pool</Link>
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
      <Route path="/admin" element={<ProtectedAdminRoute />} />
      <Route path="/admin/login" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
