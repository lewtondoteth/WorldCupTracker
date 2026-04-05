import { useEffect, useState } from "react";

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

  if (loading && !data) {
    return <main className="app-shell"><p className="status-banner">Loading 2025 World Championship pool...</p></main>;
  }

  if (!data) {
    return <main className="app-shell"><p className="status-banner error">{error || "Pool data is unavailable."}</p></main>;
  }

  const { snapshot, competitors, sourceFile } = data;
  const eliminatedCount = snapshot.entrants.filter((entry) => entry.roundOneResult === "lost").length;
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
          First-round view for the Crucible draw. The 2025 tournament ran from 19 April 2025 to 5 May 2025,
          and this page starts by showing the opening 32-player round with the eliminated picks crossed out.
        </p>
        {!isLive && snapshot.liveError ? (
          <p className="fallback-note">
            Live refresh is unavailable right now, so this page is using the local 2025 round-one snapshot.
          </p>
        ) : null}
        <div className="hero-stats">
          <div>
            <strong>16</strong>
            <span>Seeds</span>
          </div>
          <div>
            <strong>16</strong>
            <span>Qualifiers</span>
          </div>
          <div>
            <strong>{eliminatedCount}</strong>
            <span>Round-one exits</span>
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

      <p className={error ? "status-banner error" : "status-banner"}>{error || status}</p>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Competitors</p>
          <h2>Current pool entries</h2>
        </div>
      </section>

      <section className="competitor-grid">
        {competitors.map((competitor) => (
          <article key={competitor.name} className="competitor-card">
            <div className="competitor-header">
              <div>
                <p className="eyebrow">Pool entrant</p>
                <h2>{competitor.name}</h2>
              </div>
              <div className="live-pill">{competitor.liveCount} alive</div>
            </div>
            <div className="pick-columns">
              <PickList title="Seeds" players={competitor.seeds} />
              <PickList title="Qualifiers" players={competitor.qualifiers} />
            </div>
          </article>
        ))}
      </section>

      <section className="section-heading draw-heading">
        <div>
          <p className="eyebrow">Round 1</p>
          <h2>Actual 2025 results</h2>
        </div>
      </section>

      <section className="matches-grid">
        {snapshot.matches.map((match) => (
          <MatchCard key={match.id} match={match} />
        ))}
      </section>
    </main>
  );
}
