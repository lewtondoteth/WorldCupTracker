import { useEffect, useMemo, useState } from "react";

async function fetchPlayersFor2024WC() {
  const r = await fetch("http://localhost:5174/api/players/2024");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default function App() {
  const [players, setPlayers] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetchPlayersFor2024WC().then(setPlayers).catch(console.error);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return players.filter(p => {
      const label = (p.Name || `${p.FirstName ?? ""} ${p.LastName ?? ""}`).toLowerCase();
      return label.includes(needle);
    });
  }, [players, q]);

  return (
    <main style={{ maxWidth: 900, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>World Championship 2024 — Players</h1>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search player…"
        style={{ width: "100%", padding: "0.75rem", fontSize: "1rem", marginBottom: "1rem" }}
      />
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
    </main>
  );
}
