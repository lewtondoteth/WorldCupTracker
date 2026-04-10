import express from "express";
import cors from "cors";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runtimeConfig } from "./env.mjs";
import {
  readEntrantRegistry,
  readPlayerOverrides,
  readPoolFileOptional,
  readSiteSettings,
  writeEntrantRegistry,
  writePlayerOverrides,
  writePoolFile,
  writeSiteSettings,
} from "./storage.mjs";
import { buildStaticHeadToHead, buildStaticWorldCupSnapshot, buildUpcomingWorldCupSnapshot } from "./world-cup-data.mjs";
import { createFootballDataProvider } from "./football-data-provider.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST_DIR = path.join(__dirname, "..", "client", "dist");
const PORT = runtimeConfig.port;
const PUBLIC_SITE_PATHS = ["/", "/teams", "/fixtures", "/knockout", "/winners"];

const PLAYER_OVERRIDE_FIELDS = [
  "nickname",
  "nationality",
  "born",
  "photo",
  "twitter",
  "websiteUrl",
  "info",
  "photoSource",
];

const app = express();
let currentSiteSettings = { clacksNames: [] };

app.use(cors());
app.use(async (_req, res, next) => {
  try {
    if (!currentSiteSettings.clacksNames.length) {
      currentSiteSettings = normaliseSiteSettings(await readSiteSettings());
    }

    const headerValue = formatClacksHeaderValue(currentSiteSettings.clacksNames);
    if (headerValue) {
      res.set("X-Clacks-Overhead", headerValue);
    }
  } catch (error) {
    console.warn("[site-settings] failed to load clacks header:", error?.message || error);
  }

  next();
});
app.use(express.json({ limit: "1mb" }));

const staticWorldCupDataProvider = {
  key: "static-2022",
  async getSnapshot(year) {
    return Number(year) === 2022
      ? buildStaticWorldCupSnapshot(year)
      : buildUpcomingWorldCupSnapshot(year);
  },
  async getHeadToHead(player1Id, player2Id) {
    return buildStaticHeadToHead(player1Id, player2Id);
  },
};

const worldCupDataProvider = runtimeConfig.footballApiKey
  ? createFootballDataProvider({
    baseUrl: runtimeConfig.footballApiBaseUrl,
    apiKey: runtimeConfig.footballApiKey,
    fallbackSnapshotBuilder: buildStaticWorldCupSnapshot,
    upcomingSnapshotBuilder: buildUpcomingWorldCupSnapshot,
  })
  : staticWorldCupDataProvider;

function createEntrantId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `entrant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normaliseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normaliseClacksName(value) {
  return normaliseWhitespace(value).slice(0, 120);
}

function normaliseSiteSettings(payload) {
  const uniqueNames = [];
  const seen = new Set();

  for (const value of Array.isArray(payload?.clacksNames) ? payload.clacksNames : []) {
    const name = normaliseClacksName(value);
    const dedupeKey = name.toLocaleLowerCase("en-GB");
    if (!name || seen.has(dedupeKey)) {
      continue;
    }
    uniqueNames.push(name);
    seen.add(dedupeKey);
  }

  return { clacksNames: uniqueNames };
}

function formatClacksHeaderValue(names) {
  return names
    .map((name) => normaliseClacksName(name))
    .filter(Boolean)
    .map((name) => (/^GNU\s+/i.test(name) ? name : `GNU ${name}`))
    .join(", ");
}

function normaliseEntrantRegistry(entries) {
  const seenIds = new Set();
  const seenNames = new Set();
  const nextEntries = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = normaliseWhitespace(entry?.id) || createEntrantId();
    const name = normaliseWhitespace(entry?.name);
    const winningYears = [...new Set(
      (Array.isArray(entry?.winningYears) ? entry.winningYears : [])
        .map((year) => Number(year))
        .filter((year) => Number.isInteger(year) && year >= 1930 && year <= 2100),
    )].sort((left, right) => right - left);
    const nameKey = name.toLocaleLowerCase("en-GB");

    if (!name || seenIds.has(id) || seenNames.has(nameKey)) {
      continue;
    }

    nextEntries.push({ id, name, winningYears });
    seenIds.add(id);
    seenNames.add(nameKey);
  }

  return nextEntries.sort((left, right) => left.name.localeCompare(right.name));
}

function normalisePlayerOverrides(overrides) {
  const nextOverrides = [];
  const seenPlayerIds = new Set();

  for (const override of Array.isArray(overrides) ? overrides : []) {
    const playerId = Number(override?.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0 || seenPlayerIds.has(playerId)) {
      continue;
    }

    const nextOverride = { playerId };
    for (const field of PLAYER_OVERRIDE_FIELDS) {
      nextOverride[field] = typeof override?.[field] === "string" ? override[field].trim() : "";
    }

    const hasValue = PLAYER_OVERRIDE_FIELDS.some((field) => nextOverride[field]);
    if (!hasValue) {
      continue;
    }

    nextOverrides.push(nextOverride);
    seenPlayerIds.add(playerId);
  }

  return nextOverrides.sort((left, right) => left.playerId - right.playerId);
}

function normaliseCompetitor(competitor, entrantIds) {
  const entrantId = normaliseWhitespace(competitor?.entrantId) || createEntrantId();
  const name = normaliseWhitespace(competitor?.name) || "Unnamed entrant";

  const normaliseIdList = (value) => [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && entrantIds.has(item)),
  )];

  return {
    entrantId,
    name,
    seedIds: normaliseIdList(competitor?.seedIds),
    qualifierIds: normaliseIdList(competitor?.qualifierIds),
  };
}

function preparePoolPayload(year, eventName, competitors, snapshot) {
  const entrantIds = new Set((snapshot?.entrants || []).map((entry) => Number(entry.id)));
  const nextCompetitors = [];
  const seenEntrants = new Set();

  for (const competitor of Array.isArray(competitors) ? competitors : []) {
    const nextCompetitor = normaliseCompetitor(competitor, entrantIds);
    if (seenEntrants.has(nextCompetitor.entrantId)) {
      continue;
    }
    nextCompetitors.push(nextCompetitor);
    seenEntrants.add(nextCompetitor.entrantId);
  }

  return {
    year,
    eventName: normaliseWhitespace(eventName) || `FIFA World Cup ${year}`,
    competitors: nextCompetitors,
  };
}

function mergeRegistryWithCompetitors(existingRegistry, competitors) {
  const nextRegistry = [...normaliseEntrantRegistry(existingRegistry)];
  const seenIds = new Set(nextRegistry.map((entry) => entry.id));

  for (const competitor of competitors) {
    if (!competitor.entrantId || seenIds.has(competitor.entrantId)) {
      continue;
    }
    nextRegistry.push({
      id: competitor.entrantId,
      name: competitor.name,
      winningYears: [],
    });
    seenIds.add(competitor.entrantId);
  }

  return nextRegistry;
}

function applyOverridesToEntrant(entry, overridesById) {
  const override = overridesById.get(Number(entry.id));
  if (!override) {
    return entry;
  }

  return {
    ...entry,
    ...Object.fromEntries(
      PLAYER_OVERRIDE_FIELDS.map((field) => [
        field,
        override[field] ? override[field] : entry[field],
      ]),
    ),
  };
}

function buildCompetitorsForResponse(snapshot, poolData, entrantRegistry, overrides) {
  const registryById = new Map(normaliseEntrantRegistry(entrantRegistry).map((entrant) => [entrant.id, entrant]));
  const registryByName = new Map(normaliseEntrantRegistry(entrantRegistry).map((entrant) => [
    entrant.name.toLocaleLowerCase("en-GB"),
    entrant,
  ]));
  const overridesById = new Map(normalisePlayerOverrides(overrides).map((override) => [override.playerId, override]));
  const entrantsById = new Map((snapshot?.entrants || []).map((entry) => [
    Number(entry.id),
    applyOverridesToEntrant(entry, overridesById),
  ]));

  return (poolData?.competitors || []).map((competitor) => {
    const registryMatch = registryById.get(competitor.entrantId)
      || registryByName.get(String(competitor.name || "").toLocaleLowerCase("en-GB"));
    return {
      ...competitor,
      entrantId: competitor.entrantId,
      name: registryMatch?.name || competitor.name,
      winningYears: registryMatch?.winningYears || [],
      seeds: (competitor.seedIds || []).map((id) => entrantsById.get(Number(id))).filter(Boolean),
      qualifiers: (competitor.qualifierIds || []).map((id) => entrantsById.get(Number(id))).filter(Boolean),
    };
  });
}

function buildPoolResponse(snapshot, poolData, sourceFile, entrantRegistry, overrides) {
  const competitors = buildCompetitorsForResponse(snapshot, poolData, entrantRegistry, overrides);
  const poolConfigured = competitors.length > 0;

  return {
    snapshot,
    poolData,
    competitors,
    poolConfigured,
    sourceFile,
  };
}

function buildAdminPoolResponse(snapshot, poolData, sourceFile, entrantRegistry, overrides) {
  return {
    ...buildPoolResponse(snapshot, poolData, sourceFile, entrantRegistry, overrides),
    entrantRegistry: normaliseEntrantRegistry(entrantRegistry),
    playerOverrides: normalisePlayerOverrides(overrides),
  };
}

async function getTournamentSnapshot(year) {
  const snapshot = await worldCupDataProvider.getSnapshot(year);
  const overrides = normalisePlayerOverrides(await readPlayerOverrides());
  const overridesById = new Map(overrides.map((override) => [override.playerId, override]));

  return {
    ...snapshot,
    entrants: (snapshot.entrants || []).map((entry) => applyOverridesToEntrant(entry, overridesById)),
    seeds: (snapshot.seeds || []).map((entry) => applyOverridesToEntrant(entry, overridesById)),
    qualifiers: (snapshot.qualifiers || []).map((entry) => applyOverridesToEntrant(entry, overridesById)),
    allTeams: (snapshot.allTeams || []).map((entry) => applyOverridesToEntrant(entry, overridesById)),
    groups: (snapshot.groups || []).map((group) => ({
      ...group,
      standings: group.standings.map((row) => ({
        ...row,
        team: applyOverridesToEntrant(row.team, overridesById),
      })),
      fixtures: group.fixtures.map((match) => ({
        ...match,
        player1: applyOverridesToEntrant(match.player1, overridesById),
        player2: applyOverridesToEntrant(match.player2, overridesById),
      })),
    })),
    fixtureStages: (snapshot.fixtureStages || []).map((stage) => ({
      ...stage,
      matches: stage.matches.map((match) => ({
        ...match,
        player1: applyOverridesToEntrant(match.player1, overridesById),
        player2: applyOverridesToEntrant(match.player2, overridesById),
      })),
    })),
    rounds: (snapshot.rounds || []).map((round) => ({
      ...round,
      matches: round.matches.map((match) => ({
        ...match,
        player1: applyOverridesToEntrant(match.player1, overridesById),
        player2: applyOverridesToEntrant(match.player2, overridesById),
      })),
    })),
  };
}

function getRequestOrigin(req) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" && forwardedProto
    ? forwardedProto.split(",")[0].trim()
    : req.protocol;
  return `${protocol}://${req.get("host")}`;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    environment: runtimeConfig.appEnvironment,
    provider: worldCupDataProvider.key,
    liveApiEnabled: runtimeConfig.liveTournamentData,
  });
});

app.get("/api/world-cup/:year", async (req, res) => {
  try {
    const snapshot = await getTournamentSnapshot(Number(req.params.year));
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/world-cup/:year/knockout", async (req, res) => {
  try {
    const snapshot = await getTournamentSnapshot(Number(req.params.year));
    res.json({
      year: snapshot.year,
      eventName: snapshot.eventName,
      rounds: snapshot.rounds,
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/world-championship/:year", async (req, res) => {
  try {
    const snapshot = await getTournamentSnapshot(Number(req.params.year));
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/world-championship/:year/round-one", async (req, res) => {
  try {
    const snapshot = await getTournamentSnapshot(Number(req.params.year));
    res.json(snapshot.rounds?.[0] || null);
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/head-to-head", async (req, res) => {
  try {
    const player1Id = Number(req.query.p1);
    const player2Id = Number(req.query.p2);
    const year = Number(req.query.year || 2026);

    if (!Number.isInteger(player1Id) || !Number.isInteger(player2Id)) {
      return res.status(400).json({ error: "Both team ids must be provided." });
    }

    const snapshot = await getTournamentSnapshot(year);
    const entrantsById = new Map(snapshot.entrants.map((entry) => [Number(entry.id), entry]));
    const history = await worldCupDataProvider.getHeadToHead(player1Id, player2Id);
    res.json({
      year,
      competitionLabel: history.competitionLabel,
      matches: history.matches,
      summary: history.summary,
      player1: entrantsById.get(player1Id) || null,
      player2: entrantsById.get(player2Id) || null,
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.get("/api/pool/:year", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const [snapshot, poolFile, entrantRegistry, overrides] = await Promise.all([
      getTournamentSnapshot(year),
      readPoolFileOptional(year),
      readEntrantRegistry(),
      readPlayerOverrides(),
    ]);
    res.json(buildPoolResponse(snapshot, poolFile.data, poolFile.filePath, entrantRegistry, overrides));
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post("/api/pool/:year/upload", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const snapshot = await getTournamentSnapshot(year);
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Upload body must be JSON." });
    }

    const payload = preparePoolPayload(year, req.body.eventName, req.body.competitors, snapshot);
    const [sourceFile, entrantRegistry, overrides] = await Promise.all([
      writePoolFile(year, payload),
      readEntrantRegistry(),
      readPlayerOverrides(),
    ]);
    res.json(buildPoolResponse(snapshot, payload, sourceFile, entrantRegistry, overrides));
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get("/api/pool/:year/admin", async (req, res) => {
  try {
    const year = Number(req.params.year);
    const [snapshot, poolFile, entrantRegistry, overrides] = await Promise.all([
      getTournamentSnapshot(year),
      readPoolFileOptional(year),
      readEntrantRegistry(),
      readPlayerOverrides(),
    ]);
    res.json(buildAdminPoolResponse(snapshot, poolFile.data, poolFile.filePath, entrantRegistry, overrides));
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.put("/api/pool/:year/admin", async (req, res) => {
  try {
    const year = Number(req.params.year);
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Save body must be JSON." });
    }

    const snapshot = await getTournamentSnapshot(year);
    const existingRegistry = await readEntrantRegistry();
    const payload = preparePoolPayload(year, req.body.eventName, req.body.competitors, snapshot);
    const entrantRegistry = normaliseEntrantRegistry(
      mergeRegistryWithCompetitors(existingRegistry, payload.competitors),
    );

    const [sourceFile, overrides] = await Promise.all([
      writePoolFile(year, payload),
      readPlayerOverrides(),
    ]);
    await writeEntrantRegistry(entrantRegistry);
    res.json(buildAdminPoolResponse(snapshot, payload, sourceFile, entrantRegistry, overrides));
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get("/api/entrants", async (_req, res) => {
  try {
    res.json({ entrants: normaliseEntrantRegistry(await readEntrantRegistry()) });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.put("/api/entrants", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Entrant save body must be JSON." });
    }
    const entrants = normaliseEntrantRegistry(req.body.entrants || []);
    await writeEntrantRegistry(entrants);
    res.json({ entrants });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get("/api/player-overrides", async (_req, res) => {
  try {
    res.json({ overrides: normalisePlayerOverrides(await readPlayerOverrides()) });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.put("/api/player-overrides", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Team overrides save body must be JSON." });
    }
    const overrides = normalisePlayerOverrides(req.body.overrides || []);
    await writePlayerOverrides(overrides);
    res.json({ overrides });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.put("/api/player-overrides/:playerId", async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ error: "Team id must be a valid number." });
    }
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Team override save body must be JSON." });
    }

    const existingOverrides = normalisePlayerOverrides(await readPlayerOverrides());
    const nextOverrides = existingOverrides.filter((override) => Number(override.playerId) !== playerId);
    const candidate = normalisePlayerOverrides([{ ...req.body, playerId }])[0];
    if (candidate) {
      nextOverrides.push(candidate);
      nextOverrides.sort((left, right) => left.playerId - right.playerId);
    }

    await writePlayerOverrides(nextOverrides);
    res.json({ override: candidate || null, overrides: nextOverrides });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.delete("/api/player-overrides/:playerId", async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    if (!Number.isInteger(playerId) || playerId <= 0) {
      return res.status(400).json({ error: "Team id must be a valid number." });
    }

    const nextOverrides = normalisePlayerOverrides(await readPlayerOverrides())
      .filter((override) => Number(override.playerId) !== playerId);
    await writePlayerOverrides(nextOverrides);
    res.json({ overrides: nextOverrides });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

app.get("/api/site-settings", async (_req, res) => {
  try {
    currentSiteSettings = normaliseSiteSettings(await readSiteSettings());
    res.json({
      ...currentSiteSettings,
      clacksHeaderPreview: formatClacksHeaderValue(currentSiteSettings.clacksNames),
    });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.put("/api/site-settings", async (req, res) => {
  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Site settings save body must be JSON." });
    }
    const settings = normaliseSiteSettings(req.body);
    await writeSiteSettings(settings);
    currentSiteSettings = settings;
    res.json({
      ...settings,
      clacksHeaderPreview: formatClacksHeaderValue(settings.clacksNames),
    });
  } catch (error) {
    res.status(400).json({ error: String(error.message || error) });
  }
});

if (existsSync(CLIENT_DIST_DIR)) {
  app.use(express.static(CLIENT_DIST_DIR));

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send([
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin/login",
      "",
    ].join("\n"));
  });

  app.get("/sitemap.xml", (req, res) => {
    const origin = getRequestOrigin(req);
    const urls = PUBLIC_SITE_PATHS.map((sitePath) => {
      const absoluteUrl = new URL(sitePath, origin).toString();
      return `<url><loc>${absoluteUrl}</loc></url>`;
    }).join("");

    res
      .type("application/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  });

  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST_DIR, "index.html"));
  });
}

app.listen(PORT, async () => {
  currentSiteSettings = normaliseSiteSettings(await readSiteSettings());
  console.log(`WorldCupPool server listening on http://localhost:${PORT}`);
});
