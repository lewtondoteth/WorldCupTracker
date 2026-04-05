
impopc not loadingrt { useState, useEffect } from 'react';
import '../material-icons.css';

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
  const [showAdd, setShowAdd] = useState(false);
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
    setEditingNameInline(true);
  }

  // For in-place editing
  const [editingNameInline, setEditingNameInline] = useState(false);

  function cancelEdit() {
    setEditMode(false);
    setEditTarget("");
    setEditName("");
    setEditPlayers("");
  }

  // Save only the name (in-place edit)
  async function saveEditName() {
    // Keep the same players as before
    const players = competitors[editTarget] || [];
    const r = await fetch(`http://localhost:5174/api/competitors/${year}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitor: editName, players })
    });
    const data = await r.json();
    setResult(data);
    setEditMode(false);
    setEditingNameInline(false);
    fetchCompetitors();
  }

  // Save only the players (modal edit)
  async function saveEditPlayers() {
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
      <h1 className="config-title">Competition Config</h1>
      <p className="config-desc">Manage competitors and player assignments for each year here.</p>
      <div className="config-controls">
        <label htmlFor="year-input">Year: </label>
        <input id="year-input" type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2000} max={2100} />
        <button className="sync-btn" onClick={syncLast32ToDb} disabled={syncing}>
          {syncing ? 'Syncing…' : `Sync Last 32 Players (${year}) to DB`}
        </button>
      </div>
      {result && (
        <div className={`config-result ${result.error ? "error" : "success"}`}>
          {result.error ? (
            <span>Error: {result.error}</span>
          ) : (
            <span>Success.</span>
          )}
        </div>
      )}
      <div className="competitors-header-row">
        <h2 className="config-subtitle" style={{ marginBottom: 0 }}>Competitors for {year}</h2>
        <button className="icon-btn add" title="Add Competitor" onClick={() => setShowAdd(true)} style={{ marginLeft: 12, marginTop: 2 }}>
          <span className="material-icons">add</span>
        </button>
      </div>
      {competitors && competitors.error ? (
        <div className="config-error">Error loading competitors: {competitors.error}</div>
      ) : (
        <div className="competitors-table-wrapper">
          <table className="competitors-table">
            <thead>
              <tr>
                <th>Competitor</th>
                <th>Players</th>
                <th style={{ textAlign: 'right' }} colSpan={2}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(competitors).map(([name, players]) => (
                <tr key={name}>
                  <td className="competitor-name-cell" style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                    {editMode && editingNameInline && editTarget === name ? (
                      <>
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          style={{ fontSize: '1rem', padding: '0.2em 0.5em', borderRadius: 4, border: '1px solid #bbb', minWidth: 60 }}
                          autoFocus
                          onBlur={() => setEditingNameInline(false)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEditName();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                        <button className="icon-btn edit" title="Save" style={{ marginLeft: 2 }} onClick={saveEditName}>
                          <span className="material-icons">check</span>
                        </button>
                        <button className="icon-btn delete" title="Cancel" style={{ marginLeft: 2 }} onClick={cancelEdit}>
                          <span className="material-icons">close</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <span onClick={() => { setEditTarget(name); setEditName(name); setEditPlayers((competitors[name] || []).join(", ")); setEditMode(true); setEditingNameInline(true); }} style={{ cursor: 'pointer' }}>{name}</span>
                        <button
                          className="icon-btn delete"
                          title="Delete"
                          tabIndex={-1}
                          style={{ marginLeft: 2 }}
                          onClick={e => { e.stopPropagation(); handleDeleteCompetitor(name); }}
                        >
                          <span className="material-icons">delete</span>
                        </button>
                      </>
                    )}
                  </td>
                  <td>{Array.isArray(players) ? players.join(", ") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Add Competitor Modal */}
      {showAdd && (
        <div className="edit-dialog" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 200, background: '#fff', boxShadow: '0 4px 32px rgba(0,0,0,0.18)' }}>
          <h3>Add Competitor</h3>
          <form onSubmit={e => { handleAddCompetitor(e); setShowAdd(false); }}>
            <div className="form-row">
              <label htmlFor="add-name">Name: </label>
              <input id="add-name" value={addName} onChange={e => setAddName(e.target.value)} required autoFocus />
            </div>
            <div className="edit-dialog-actions">
              <button className="save-btn" type="submit" disabled={adding}>Add</button>
              <button className="cancel-btn" type="button" onClick={() => { setShowAdd(false); setAddName(""); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {/* Edit Competitor Modal (for players only, not name) */}
      {editMode && !editingNameInline && (
        <div className="edit-dialog" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 200, background: '#fff', boxShadow: '0 4px 32px rgba(0,0,0,0.18)' }}>
          <h3>Edit Competitor</h3>
          <div className="form-row">
            <label htmlFor="edit-players">Players (comma separated): </label>
            <input id="edit-players" value={editPlayers} onChange={e => setEditPlayers(e.target.value)} />
          </div>
          <div className="edit-dialog-actions">
            <button className="save-btn" onClick={saveEditPlayers}>Save</button>
            <button className="cancel-btn" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
