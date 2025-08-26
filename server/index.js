import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors()); // front-end on a different port during dev

const SN_API = "https://api.snooker.org";
const SN_HEADER = { "X-Requested-By": "NicholasAndroidApp" };

/**
 * Option A: use the known 2024 WC event id (1460)
 * GET /api/players/2024
 */
app.get("/api/players/2024", async (_req, res) => {
  try {
    const url = `${SN_API}/?t=9&e=1460`; // players in event 1460
    const r = await fetch(url, { headers: SN_HEADER });
    if (!r.ok) return res.status(r.status).send(await r.text());
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Option B: resolve the event id programmatically
 * - find World Championship in season 2023 (i.e., 2023/2024)
 * - then list players (t=9)
 * GET /api/players/by-discovery
 */
app.get("/api/players/by-discovery", async (_req, res) => {
  try {
    // list events in 2023/24 main tour
    const eventsUrl = `${SN_API}/?t=5&s=2023&tr=main`;
    const eventsRes = await fetch(eventsUrl, { headers: SN_HEADER });
    if (!eventsRes.ok) return res.status(eventsRes.status).send(await eventsRes.text());
    const events = await eventsRes.json();

    // find the event whose name contains "World Championship" and year 2024
    const wc = events.find(ev =>
      /World Championship/i.test(ev.Name ?? ev.Event) &&
      /2024/.test(ev.Name ?? ev.Event)
    );
    if (!wc?.ID) return res.status(404).json({ error: "World Championship 2024 not found" });

    const playersUrl = `${SN_API}/?t=9&e=${wc.ID}`;
    const playersRes = await fetch(playersUrl, { headers: SN_HEADER });
    if (!playersRes.ok) return res.status(playersRes.status).send(await playersRes.text());
    const players = await playersRes.json();

    res.json({ event: wc, players });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 5174; // pick a port not used by Vite
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
