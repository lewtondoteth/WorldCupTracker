
import { useState, useEffect } from 'react';

export default function Config() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [year, setYear] = useState(2024);
  const [competitors, setCompetitors] = useState({});
  const [editName, setEditName] = useState("");
  const [editPlayers, setEditPlayers] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editTarget, setEditTarget] = useState("");
  const [playersList, setPlayersList] = useState([]);
  // Add competitor form state
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  async function handleAddCompetitor(e) {
    e.preventDefault();
    setAdding(true);
    setResult(null);
    if (!addName) {
      setResult({ error: "Competitor name required." });
      setAdding(false);
      return;
    }
    const r = await fetch(`http://localhost:5174/api/competitors/${year}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitor: addName, players: [] })
      });
    const data = await r.json();
    setResult(data);
    setAddName("");
    setAdding(false);
    fetchCompetitors();
  }

  async function handleDeleteCompetitor(name) {
    if (!window.confirm(`Delete competitor '${name}' and all assignments?`)) return;
    setResult(null);
    const r = await fetch(`http://localhost:5174/api/competitors/${year}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitor: name })
    });
    const data = await r.json();
    setResult(data);
    fetchCompetitors();
  }

  useEffect(() => {
    fetchCompetitors();
    fetchPlayers();
    // eslint-disable-next-line
  }, [year]);

  async function fetchCompetitors() {
    const r = await fetch(`http://localhost:5174/api/competitors/${year}`);
    setCompetitors(await r.json());
  }

  async function fetchPlayers() {
    const r = await fetch(`http://localhost:5174/api/players/${year}`);
    setPlayersList(await r.json());
  }

  async function syncLast32ToDb() {
    setSyncing(true);
    setResult(null);
    try {
      const r = await fetch(`http://localhost:5174/api/players/last32-to-db/${year}`, { method: 'POST' });
      const data = await r.json();
      setResult(data);
      fetchPlayers();
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setSyncing(false);
    }
  }

  function startEdit(name) {
    setEditTarget(name);
    setEditName(name);
    setEditPlayers((competitors[name] || []).join(", "));
    setEditMode(true);
  }

  function cancelEdit() {
    setEditMode(false);
    setEditTarget("");
    setEditName("");
    setEditPlayers("");
  }

  async function saveEdit() {
    const playerNames = editPlayers.split(",").map(s => s.trim()).filter(Boolean);
    // Map player names to IDs
    const nameToId = {};
    for (const p of playersList) {
      const label = p.Name || `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim();
      nameToId[label] = p.ID;
    }
    const ids = playerNames.map(n => nameToId[n]).filter(Boolean);
    if (!ids.length) {
      setResult({ error: "No valid player names found." });
      return;
    }
    const r = await fetch(`http://localhost:5174/api/competitors/${year}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitor: editName, players: ids })
    });
    const data = await r.json();
    setResult(data);
    setEditMode(false);
    fetchCompetitors();
  }

  return (
    <div className="config-page">
      <h1>Competition Config</h1>
      <p>Manage competitors and player assignments for each year here.</p>
      <div style={{ margin: '1rem 0' }}>
        <label>Year: </label>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2000} max={2100} style={{ width: 80 }} />
      </div>
      <button onClick={syncLast32ToDb} disabled={syncing} style={{ margin: '1rem 0', padding: '0.5rem 1.5rem', fontSize: '1rem' }}>
        {syncing ? 'Syncing…' : `Sync Last 32 Players (${year}) to DB`}
      </button>
      {result && (
        <div style={{ marginTop: 16 }}>
          {result.error ? (
            <span style={{ color: 'red' }}>Error: {result.error}</span>
          ) : (
            <span style={{ color: 'green' }}>Success.</span>
          )}
        </div>
      )}
      <h2 style={{ marginTop: 32 }}>Competitors for {year}</h2>
      {/* Add Competitor Form */}
      <form onSubmit={handleAddCompetitor} style={{ margin: '16px 0', padding: 12, border: '1px solid #ddd', borderRadius: 8, maxWidth: 600 }}>
        <h3>Add Competitor</h3>
        <div style={{ marginBottom: 8 }}>
          <label>Name: </label>
          <input value={addName} onChange={e => setAddName(e.target.value)} style={{ width: 200 }} required />
        </div>
        <button type="submit" disabled={adding}>Add Competitor</button>
      </form>
      {competitors && competitors.error ? (
        <div style={{ color: 'red', marginTop: 16 }}>Error loading competitors: {competitors.error}</div>
      ) : (
        <table style={{ width: '100%', maxWidth: 700, borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Competitor</th>
              <th style={{ textAlign: 'left', padding: 6 }}>Players</th>
            <th></th>
            <th></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(competitors).map(([name, players]) => (
              <tr key={name}>
                <td style={{ padding: 6 }}>{name}</td>
                <td style={{ padding: 6 }}>{Array.isArray(players) ? players.join(", ") : "-"}</td>
                <td style={{ padding: 6 }}>
                  <button onClick={() => startEdit(name)}>Edit</button>
                </td>
                <td style={{ padding: 6 }}>
                  <button onClick={() => handleDeleteCompetitor(name)} style={{ color: 'red' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editMode && (
        <div style={{ marginTop: 24, border: '1px solid #ccc', padding: 16, borderRadius: 8, maxWidth: 500 }}>
          <h3>Edit Competitor</h3>
          <div style={{ marginBottom: 8 }}>
            <label>Name: </label>
            <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: 200 }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>Players (comma separated): </label>
            <input value={editPlayers} onChange={e => setEditPlayers(e.target.value)} style={{ width: 300 }} />
          </div>
          <button onClick={saveEdit} style={{ marginRight: 8 }}>Save</button>
          <button onClick={cancelEdit}>Cancel</button>
        </div>
      )}
    </div>
  );
}
