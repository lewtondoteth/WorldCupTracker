


import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import Config from "./pages/Config.jsx";

const WC_YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015];

async function fetchPlayersForWC(year) {
  const r = await fetch(`http://localhost:5174/api/players/${year}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [q, setQ] = useState("");
  const [year, setYear] = useState(2024);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPlayersForWC(year)
      .then(setPlayers)
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, [year]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return players.filter(p => {
      const label = (p.Name || `${p.FirstName ?? ""} ${p.LastName ?? ""}`).toLowerCase();
      return label.includes(needle);
    });
  }, [players, q]);

  return (
    <>
      <nav style={{ maxWidth: 900, margin: "2rem auto 0", padding: "0 1rem", display: "flex", gap: 16 }}>
        <Link to="/">Players</Link>
        <Link to="/config">Config</Link>
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            <main style={{ maxWidth: 900, margin: "2rem auto", padding: "0 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <h1 style={{ margin: 0, flex: 1 }}>World Championship {year} — Players</h1>
                <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ fontSize: "1rem", padding: 6 }}>
                  {WC_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search player…"
                style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", marginBottom: "1rem" }}
              />
              {loading ? (
                <div style={{ textAlign: "center", padding: "2rem", fontSize: "1.2rem" }}>Loading…</div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: "12px"
                }}>
                  {filtered.map(p => {
                    const label = p.Name || `${p.FirstName ?? ""} ${p.LastName ?? ""}`.trim();
                    return (
                      <article key={String(p.ID)} style={{
                        border: "1px solid #eaeaea",
                        borderRadius: 12,
                        padding: "12px"
                      }}>
                        <h3 style={{ margin: 0 }}>{label}</h3>
                        {p.Nationality && <small>{p.Nationality}</small>}
                      </article>
                    );
                  })}
                </div>
              )}
            </main>
          }
        />
        <Route path="/config" element={<Config />} />
      </Routes>
    </>
  );
}
