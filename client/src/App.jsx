import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import dogsPlayingPool from "../../res/dogsplayingpool.jpeg";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5174";
const YEAR = 2025;
const ADMIN_PASSWORD = "painting";
const ADMIN_SESSION_KEY = "snooker-admin-authenticated";

async function fetchPool() {
  const response = await fetch(`${API_BASE}/api/pool/${YEAR}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load pool data");
  }
  return data;
}

async function uploadPool(payload) {
  const response = await fetch(`${API_BASE}/api/pool/${YEAR}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return data;
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

function HomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
        const nextData = await fetchPool();
        if (!cancelled) {
          setData(nextData);
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
  }, []);

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
      aliveEntrants: snapshot.entrants.filter((entry) => !entrantsById.get(entry.id).eliminated),
      decoratedCompetitors,
    };
  }, [data, selectedRoundKey]);

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading 2025 World Championship pool...</p></main>;
  }

  if (!data || !derived) {
    return <main className="app-shell"><p className="status-banner error">{error || "Pool data is unavailable."}</p></main>;
  }

  const { snapshot } = data;
  const { selectedRound, decoratedCompetitors } = derived;
  const isLive = snapshot.dataSource === "live";
  const sourceLabel = isLive ? "Live data" : "Cached fallback";

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-grid" />
        <div className="hero-header">
          <h1>
            World Championship
            <span>{YEAR}</span>
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
                  </div>
                )}
              </article>
            );
          })}
        </section>
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
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("Upload a picks JSON file for the World Championship pool.");
  const [error, setError] = useState("");

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
      await uploadPool(payload);
      setStatus(`Loaded ${file.name} into the backend.`);
    } catch (uploadError) {
      setError(uploadError.message || "That file could not be uploaded.");
    } finally {
      setUploading(false);
      event.target.value = "";
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
      <section className="admin-card">
        <div className="admin-topbar">
          <div>
            <p className="eyebrow">Protected Area</p>
            <h1>Admin</h1>
            <p className="admin-copy">Upload a replacement picks file for the World Championship pool.</p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={handleLogout}>Lock admin</button>
        </div>

        <div className="admin-upload-panel">
          <p className="toolbar-label">Picks upload</p>
          <label className="upload-button">
            <input type="file" accept="application/json" onChange={handleUpload} disabled={uploading} />
            {uploading ? "Uploading..." : "Upload a new picks file"}
          </label>
          <p className={error ? "status-banner error" : "status-banner"}>{error || status}</p>
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
