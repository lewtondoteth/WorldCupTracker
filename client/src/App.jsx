import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:5174";
const YEAR = 2025;

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
            <span>{player.isSeed ? `Seed ${player.seedNumber}` : "Qualifier"}</span>
          </li>
        ))}
      </ul>
    </section>
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
        <span>{match.scheduledDate.slice(0, 10)}</span>
      </div>
      {renderSide(match.player1, match.winnerId === match.player1.id)}
      {renderSide(match.player2, match.winnerId === match.player2.id)}
    </article>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Using the generated demo pool file.");
  const [selectedRoundKey, setSelectedRoundKey] = useState("");

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
      const nextData = await uploadPool(payload);
      setData(nextData);
      setStatus(`Loaded ${file.name} into the backend.`);
    } catch (uploadError) {
      setError(uploadError.message || "That file could not be uploaded.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  const derived = useMemo(() => {
    if (!data?.snapshot?.rounds?.length) {
      return null;
    }

    const { snapshot, competitors } = data;
    const selectedRound = snapshot.rounds.find((round) => round.key === selectedRoundKey) || snapshot.rounds[0];
    const roundOrderById = new Map(snapshot.rounds.map((round) => [round.id, round.order]));

    const entrantsById = new Map(
      snapshot.entrants.map((entry) => {
        const eliminatedOrder = entry.eliminatedInRoundId ? roundOrderById.get(entry.eliminatedInRoundId) : null;
        const eliminated = eliminatedOrder !== null && eliminatedOrder <= selectedRound.order;
        return [entry.id, { ...entry, eliminated }];
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

  const { snapshot, sourceFile } = data;
  const { selectedRound, aliveEntrants, decoratedCompetitors } = derived;
  const isLive = snapshot.dataSource === "live";
  const sourceLabel = isLive ? "Live data" : "Cached fallback";

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Snooker Pool Tracker</p>
        <div className={isLive ? "source-indicator live" : "source-indicator cached"}>
          {sourceLabel}
        </div>
        <h1>{snapshot.eventName}</h1>
        <p className="hero-copy">
          Main-draw view for the Crucible. Use the round selector to switch between round one, round two,
          the quarterfinals, semifinals, and the final. Player strike-through and alive totals update for the round you pick.
        </p>
        {!isLive && snapshot.liveError ? (
          <p className="fallback-note">
            Live refresh is unavailable right now, so this page is using the local 2025 tournament snapshot.
          </p>
        ) : null}
        <div className="hero-stats">
          <div>
            <strong>{selectedRound.name}</strong>
            <span>Selected round</span>
          </div>
          <div>
            <strong>{aliveEntrants.length}</strong>
            <span>Players still alive</span>
          </div>
          <div>
            <strong>{selectedRound.matchCount}</strong>
            <span>Matches in this round</span>
          </div>
        </div>
      </section>

      <section className="toolbar-card">
        <div>
          <p className="toolbar-label">Pool file</p>
          <p className="toolbar-value">{sourceFile}</p>
        </div>
        <label className="upload-button">
          <input type="file" accept="application/json" onChange={handleUpload} disabled={uploading} />
          {uploading ? "Uploading..." : "Upload a new picks file"}
        </label>
      </section>

      <section className="round-selector-card">
        <div className="round-selector-header">
          <div>
            <p className="eyebrow">Rounds</p>
            <h2>Choose the stage to view</h2>
          </div>
        </div>
        <div className="round-selector-buttons">
          {snapshot.rounds.map((round) => (
            <button
              key={round.key}
              type="button"
              className={round.key === selectedRound.key ? "round-button active" : "round-button"}
              onClick={() => setSelectedRoundKey(round.key)}
            >
              <span>{round.shortLabel}</span>
              <strong>{round.name}</strong>
            </button>
          ))}
        </div>
      </section>

      <p className={error ? "status-banner error" : "status-banner"}>{error || status}</p>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Competitors</p>
          <h2>Picks alive after {selectedRound.name}</h2>
        </div>
      </section>

      <section className="competitor-grid">
        {decoratedCompetitors.map((competitor) => {
          const liveCount = [...competitor.seeds, ...competitor.qualifiers].filter((player) => !player.eliminated).length;
          return (
            <article key={competitor.name} className="competitor-card">
              <div className="competitor-header">
                <div>
                  <p className="eyebrow">Pool entrant</p>
                  <h2>{competitor.name}</h2>
                </div>
                <div className="live-pill">{liveCount} alive</div>
              </div>
              <div className="pick-columns">
                <PickList title="Seeds" players={competitor.seeds} />
                <PickList title="Qualifiers" players={competitor.qualifiers} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="section-heading draw-heading">
        <div>
          <p className="eyebrow">{selectedRound.shortLabel}</p>
          <h2>{selectedRound.name} results</h2>
        </div>
      </section>

      <section className="matches-grid">
        {selectedRound.matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </section>
    </main>
  );
}
