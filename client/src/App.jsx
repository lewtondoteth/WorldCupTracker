import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import crownIcon from "../../res/crown.png";
import walesFlag from "./assets/flags/wales.svg";

const APP_ENV = import.meta.env.VITE_APP_ENV || (import.meta.env.DEV ? "local" : "production");
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
const API_TARGET = API_BASE || "same-origin /api";
const BRAND_NAME = "WorldCupPool";
const BRAND_SHORT_NAME = "WorldCupPool";
const PUBLIC_DEFAULT_YEAR = new Date().getFullYear();
const PUBLIC_YEAR_OPTIONS = [2026, 2022];
const ADMIN_DEFAULT_YEAR = PUBLIC_YEAR_OPTIONS[0];
const ADMIN_YEAR_OPTIONS = PUBLIC_YEAR_OPTIONS;
const WINNER_YEAR_OPTIONS = Array.from({ length: ADMIN_DEFAULT_YEAR - 2022 + 1 }, (_, index) => ADMIN_DEFAULT_YEAR - index);
const ADMIN_PASSWORD = "painting";
const ADMIN_SESSION_KEY = "worldcup-admin-authenticated";
const PUBLIC_YEAR_SESSION_KEY = "worldcup-public-selected-year";
const PUBLIC_SHOW_PHOTOS_SESSION_KEY = "worldcup-public-show-photos";
const STRUCTURE_MODE_SESSION_KEY = "worldcup-public-structure-mode";
const STRUCTURE_MODE_YEAR_SESSION_KEY = "worldcup-public-structure-mode-year";
const MATCHES_ROUND_SESSION_KEY = "worldcup-public-fixtures-stage";
const MATCHES_ENTRANT_FILTERS_SESSION_KEY = "worldcup-public-entrant-filters";
const MATCHES_PLAYER_FILTERS_SESSION_KEY = "worldcup-public-team-filters";
const MATCHES_COUNTRY_FILTERS_SESSION_KEY = "worldcup-public-country-filters";
const ENTRANTS_SORT_SESSION_KEY = "worldcup-entrants-sort";
const SITE_DESCRIPTION = "Track a World Cup pool with group tables, fixtures, knockout rounds, and winners.";
const SEED_LABEL = "Bucket A";
const QUALIFIER_LABEL = "Bucket B";
const TEAM_ASSIGNMENT_LABEL = "Assigned team";
const TEAM_STATUS_LABEL = "Qualified";
const SOURCE_LABEL = "FIFA World Cup data";
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

const PAGE_METADATA = {
  "/": {
    title: `${BRAND_NAME} | FIFA World Cup Pool Tracker`,
    description: SITE_DESCRIPTION,
  },
  "/teams": {
    title: `Teams | ${BRAND_NAME}`,
    description: "Browse group tables, qualified teams, and pool assignments.",
  },
  "/structure": {
    title: `Structure | ${BRAND_NAME}`,
    description: "Switch between group tables and the knockout bracket as the tournament unfolds.",
  },
  "/fixtures": {
    title: `Fixtures | ${BRAND_NAME}`,
    description: "Follow match results from the group stage through the final.",
  },
  "/winners": {
    title: `Winners | ${BRAND_NAME}`,
    description: "Review pool winners and outcomes across years.",
  },
  "/admin": {
    title: `Admin | ${BRAND_NAME}`,
    description: "Administrative controls for pool updates and team overrides.",
    robots: "noindex, nofollow",
  },
  "/admin/login": {
    title: `Admin Login | ${BRAND_NAME}`,
    description: "Sign in to manage tournament data and team overrides.",
    robots: "noindex, nofollow",
  },
};

const NOT_FOUND_METADATA = {
  title: `Page Not Found | ${BRAND_NAME}`,
  description: "The page you were looking for does not exist on this tournament tracker.",
  robots: "noindex, nofollow",
};

function createEntrantId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `entrant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalisePathname(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "") || "/";
}

function getPageMetadata(pathname) {
  return PAGE_METADATA[normalisePathname(pathname)] || NOT_FOUND_METADATA;
}

function updateMetaTag(attributeName, attributeValue, content) {
  if (typeof document === "undefined") {
    return;
  }

  let tag = document.head.querySelector(`meta[${attributeName}="${attributeValue}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attributeName, attributeValue);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function upsertLinkTag(rel, href) {
  if (typeof document === "undefined") {
    return;
  }

  let tag = document.head.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

function usePageMetadata() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const pathname = normalisePathname(location.pathname);
    const meta = getPageMetadata(pathname);
    const canonicalUrl = new URL(pathname, window.location.origin).toString();

    document.title = meta.title;
    updateMetaTag("name", "description", meta.description);
    updateMetaTag("name", "robots", meta.robots || "index, follow");
    updateMetaTag("property", "og:title", meta.title);
    updateMetaTag("property", "og:description", meta.description);
    updateMetaTag("property", "og:url", canonicalUrl);
    updateMetaTag("name", "twitter:title", meta.title);
    updateMetaTag("name", "twitter:description", meta.description);
    upsertLinkTag("canonical", canonicalUrl);
  }, [location.pathname]);
}

function normalisePlayerOverrideDraft(override) {
  const playerId = Number(override?.playerId);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    return null;
  }

  const next = { playerId };
  for (const field of PLAYER_OVERRIDE_FIELDS) {
    next[field] = typeof override?.[field] === "string" ? override[field] : "";
  }

  const hasValue = PLAYER_OVERRIDE_FIELDS.some((field) => next[field].trim());
  return hasValue ? next : null;
}

function useSessionState(key, initialValue) {
  const [value, setValue] = useState(() => {
    const fallbackValue = typeof initialValue === "function" ? initialValue() : initialValue;

    if (typeof window === "undefined") {
      return fallbackValue;
    }

    try {
      const storedValue = window.sessionStorage.getItem(key);
      return storedValue === null ? fallbackValue : JSON.parse(storedValue);
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore session storage failures and keep the in-memory value.
    }
  }, [key, value]);

  return [value, setValue];
}

function usePublicSelectedYear() {
  const [selectedYear, setSelectedYear] = useSessionState(
    PUBLIC_YEAR_SESSION_KEY,
    () => PUBLIC_DEFAULT_YEAR,
  );

  useEffect(() => {
    if (!PUBLIC_YEAR_OPTIONS.includes(selectedYear)) {
      setSelectedYear(PUBLIC_DEFAULT_YEAR);
    }
  }, [selectedYear, setSelectedYear]);

  return [PUBLIC_YEAR_OPTIONS.includes(selectedYear) ? selectedYear : PUBLIC_DEFAULT_YEAR, setSelectedYear];
}

function usePublicShowPhotos() {
  return useSessionState(PUBLIC_SHOW_PHOTOS_SESSION_KEY, true);
}

function normaliseSessionList(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string" && item.trim());
  }

  if (typeof value === "string" && value.trim() && value !== "all") {
    return [value.trim()];
  }

  return [];
}

function useIsCompactViewport(maxWidth = 640) {
  const [isCompact, setIsCompact] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth <= maxWidth : false
  ));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const handleChange = (event) => setIsCompact(event.matches);

    setIsCompact(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [maxWidth]);

  return isCompact;
}

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
      throw new Error(`The API returned HTML instead of JSON. App env: ${APP_ENV}. Make sure the backend is running on ${API_TARGET} and that VITE_API_BASE points to the API server when developing locally.`);
    }
    throw new Error(fallbackMessage);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || fallbackMessage);
  }
  return data;
}

async function fetchPool(year, options = {}) {
  const params = new URLSearchParams();
  if (options.forceRefresh) {
    params.set("refresh", "1");
  }
  const response = await fetch(`${API_BASE}/api/pool/${year}${params.toString() ? `?${params.toString()}` : ""}`);
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

async function fetchPlayerOverrides() {
  const response = await fetch(`${API_BASE}/api/player-overrides`);
  return readJsonResponse(response, "Failed to load player overrides");
}

async function fetchSiteSettings() {
  const response = await fetch(`${API_BASE}/api/site-settings`);
  return readJsonResponse(response, "Failed to load site settings");
}

async function savePlayerOverride(playerId, payload) {
  const response = await fetch(`${API_BASE}/api/player-overrides/${playerId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Failed to save player override");
}

async function deletePlayerOverride(playerId) {
  const response = await fetch(`${API_BASE}/api/player-overrides/${playerId}`, {
    method: "DELETE",
  });
  return readJsonResponse(response, "Failed to clear player override");
}

async function saveSiteSettings(payload) {
  const response = await fetch(`${API_BASE}/api/site-settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "Failed to save site settings");
}

async function fetchHeadToHead(player1Id, player2Id, year, options = {}) {
  const params = new URLSearchParams({
    p1: String(player1Id),
    p2: String(player2Id),
    year: String(year),
  });
  if (options.forceRefresh) {
    params.set("refresh", "1");
  }
  const response = await fetch(`${API_BASE}/api/head-to-head?${params.toString()}`);
  return readJsonResponse(response, "Failed to load head-to-head history");
}

function RefreshButton({ onClick, busy = false, label = "Refresh data", className = "" }) {
  return (
    <button
      type="button"
      className={`subtle-refresh-button${className ? ` ${className}` : ""}${busy ? " busy" : ""}`}
      onClick={onClick}
      disabled={busy}
      aria-label={busy ? `${label}. Refreshing now.` : label}
      title={busy ? "Refreshing..." : label}
    >
      <span className="subtle-refresh-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v6h-6" />
        </svg>
      </span>
      <span>{busy ? "Refreshing" : "Refresh"}</span>
    </button>
  );
}

function svgToDataUri(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const NATIONALITY_FLAGS = {
  Australia: { type: "emoji", code: "AU" },
  Belgium: { type: "emoji", code: "BE" },
  China: { type: "emoji", code: "CN" },
  England: {
    type: "image",
    src: svgToDataUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 36'><rect width='60' height='36' fill='#fff'/><rect x='24' width='12' height='36' fill='#c8102e'/><rect y='12' width='60' height='12' fill='#c8102e'/></svg>"),
  },
  HongKong: { type: "emoji", code: "HK" },
  "Hong Kong": { type: "emoji", code: "HK" },
  Iran: { type: "emoji", code: "IR" },
  Ireland: { type: "emoji", code: "IE" },
  "Northern Ireland": {
    type: "image",
    src: svgToDataUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 36'><rect width='60' height='36' fill='#fff'/><rect x='24' width='12' height='36' fill='#c8102e'/><rect y='12' width='60' height='12' fill='#c8102e'/><polygon points='30,7 33,14 41,14 35,19 38,27 30,22 22,27 25,19 19,14 27,14' fill='#fff' stroke='#c8102e' stroke-width='1.5'/><circle cx='30' cy='18' r='3.5' fill='#c8102e'/><path d='M27.8 8.4c0-1.8 1-3.3 2.2-4.2c1.2.9 2.2 2.4 2.2 4.2v1.5h-4.4z' fill='#d4af37'/></svg>"),
  },
  Pakistan: { type: "emoji", code: "PK" },
  Scotland: {
    type: "image",
    src: svgToDataUri("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 36'><rect width='60' height='36' fill='#005eb8'/><line x1='0' y1='0' x2='60' y2='36' stroke='#fff' stroke-width='8'/><line x1='60' y1='0' x2='0' y2='36' stroke='#fff' stroke-width='8'/></svg>"),
  },
  Thailand: { type: "emoji", code: "TH" },
  Ukraine: { type: "emoji", code: "UA" },
  Wales: {
    type: "image",
    src: walesFlag,
    className: "player-flag-wales",
  },
};

function getNationalityFlag(nationality) {
  const entry = NATIONALITY_FLAGS[String(nationality || "").trim()] || null;
  if (!entry) {
    return null;
  }
  if (entry.type === "emoji") {
    const { code } = entry;
    if (!code || code.length !== 2) {
      return null;
    }
    return {
      type: "emoji",
      value: code
        .toUpperCase()
        .split("")
        .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
        .join(""),
    };
  }
  if (entry.type === "image" && entry.src) {
    return {
      type: "image",
      src: entry.src,
      className: entry.className || "",
    };
  }
  return null;
}

function NationalityFlag({ nationality, className = "player-flag" }) {
  const flag = getNationalityFlag(nationality);
  if (!flag) {
    return null;
  }
  if (flag.type === "image") {
    const imageClassName = [className, flag.className].filter(Boolean).join(" ");
    return <img className={imageClassName} src={flag.src} alt="" aria-hidden="true" />;
  }
  return <span className={className} aria-hidden="true">{flag.value}</span>;
}

function formatPlayerBirthDate(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getPlayerAge(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const birthdayPassed = (
    today.getMonth() > parsed.getMonth()
    || (today.getMonth() === parsed.getMonth() && today.getDate() >= parsed.getDate())
  );

  if (!birthdayPassed) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function normaliseExternalUrl(value, fallbackPrefix = "https://") {
  const nextValue = String(value || "").trim();
  if (!nextValue) {
    return "";
  }
  if (/^(null|undefined|#)$/i.test(nextValue)) {
    return "";
  }
  if (/^https?:\/\//i.test(nextValue)) {
    return nextValue;
  }
  return `${fallbackPrefix}${nextValue.replace(/^\/+/, "")}`;
}

function buildClacksHeaderPreview(values) {
  return values
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((name) => (/^GNU\s+/i.test(name) ? name : `GNU ${name}`))
    .join(", ");
}

function PlayerIdentity({ player, compact = false, showPhoto = true, ownerName = "", onNameClick = null }) {
  const identityClassName = `${compact ? "player-identity compact" : "player-identity"}${player.eliminated ? " eliminated" : ""}`;
  const canOpenBio = typeof onNameClick === "function" && player && !isPlaceholderMatchPlayer(player);

  return (
    <div className={identityClassName}>
      {showPhoto ? (
        <div className="player-avatar-shell">
          {player.photo ? (
            <img className="player-avatar" src={player.photo} alt="" loading="lazy" />
          ) : (
            <div className="player-avatar fallback" aria-hidden="true">
              {String(player.name || "?").trim().slice(0, 1)}
            </div>
          )}
        </div>
      ) : null}
      <div className="player-text">
        {canOpenBio ? (
          <button
            type="button"
            className="player-name-button"
            onClick={(event) => {
              event.stopPropagation();
              onNameClick(player);
            }}
          >
            {player.name}{ownerName ? ` (${ownerName})` : ""}
          </button>
        ) : (
          <strong>{player.name}{ownerName ? ` (${ownerName})` : ""}</strong>
        )}
        <small>
          <NationalityFlag nationality={player.nationality} />
          <span>{player.nationality || "Unknown"}</span>
        </small>
      </div>
    </div>
  );
}

function PickList({ title, players, showPhotos }) {
  return (
    <section className="pick-group">
      <div className="pick-group-header">
        <h3>{title}</h3>
      </div>
      <ul className="pick-list">
        {players.map((player) => (
          <li key={player.id} className={player.eliminated ? "pick-row eliminated" : "pick-row"}>
            <PlayerIdentity player={player} showPhoto={showPhotos} />
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

function isPlaceholderMatchPlayer(player) {
  const name = String(player?.name || "").trim();
  return !name || /^tbd$/i.test(name);
}

function isPlaceholderEntrant(entry) {
  const name = String(entry?.name || "").trim();
  return !name || /^tbd$/i.test(name);
}

function shuffleArray(items) {
  const nextItems = [...items];
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
}

function buildBalancedTargetCounts(total, entrantIds) {
  const targets = new Map(entrantIds.map((entrantId) => [entrantId, Math.floor(total / entrantIds.length)]));
  const remainder = total % entrantIds.length;
  for (const entrantId of shuffleArray(entrantIds).slice(0, remainder)) {
    targets.set(entrantId, (targets.get(entrantId) || 0) + 1);
  }
  return targets;
}

function buildSuggestedTargetCounts(total, entrantIds) {
  const targets = new Map(entrantIds.map((entrantId) => [entrantId, Math.floor(total / entrantIds.length)]));
  const remainder = total % entrantIds.length;
  entrantIds.slice(0, remainder).forEach((entrantId) => {
    targets.set(entrantId, (targets.get(entrantId) || 0) + 1);
  });
  return targets;
}

function normaliseTargetCountInput(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function buildAutoAssignment(snapshot, competitors, targetCountsOverride = null) {
  const roundOne = snapshot.rounds.find((round) => round.key === "round-of-16") || snapshot.rounds[0];
  const actualPlayers = snapshot.entrants.filter((entry) => !isPlaceholderEntrant(entry));
  const entrantOrder = new Map(snapshot.entrants.map((entry, index) => [entry.id, index]));
  const entrantIds = competitors.map((competitor, index) => competitor.entrantId || `competitor-${index}`);

  if (!entrantIds.length) {
    throw new Error("Add at least one entrant before running automatic assignment.");
  }

  if (entrantIds.length < 2 && roundOne?.matches.some((match) => (
    !isPlaceholderMatchPlayer(match.player1) && !isPlaceholderMatchPlayer(match.player2)
  ))) {
    throw new Error("At least two entrants are needed to separate first-round opponents.");
  }

  const bucketKeyForPlayer = (player) => (player.isSeed ? "seedIds" : "qualifierIds");
  const allSeeds = actualPlayers.filter((player) => player.isSeed);
  const allQualifiers = actualPlayers.filter((player) => !player.isSeed);
  const targetCounts = targetCountsOverride || {
    seedIds: buildBalancedTargetCounts(allSeeds.length, entrantIds),
    qualifierIds: buildBalancedTargetCounts(allQualifiers.length, entrantIds),
  };

  const candidateMatches = shuffleArray(roundOne?.matches || []);

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const nextCompetitors = competitors.map((competitor) => ({
      ...competitor,
      seedIds: [],
      qualifierIds: [],
    }));
    const competitorIndexById = new Map(nextCompetitors.map((competitor, index) => [
      competitor.entrantId || `competitor-${index}`,
      index,
    ]));
    const bucketCountsByEntrant = new Map(entrantIds.map((entrantId) => [
      entrantId,
      { seedIds: 0, qualifierIds: 0 },
    ]));
    const ownerByPlayerId = new Map();
    const assignedPlayerIds = new Set();

    function assignPlayerToEntrant(player, excludedEntrantId = null) {
      const bucket = bucketKeyForPlayer(player);
      const eligibleEntrants = entrantIds.filter((entrantId) => entrantId !== excludedEntrantId);
      if (!eligibleEntrants.length) {
        return null;
      }

      const withCapacity = eligibleEntrants.filter((entrantId) => (
        (bucketCountsByEntrant.get(entrantId)?.[bucket] || 0) < (targetCounts[bucket].get(entrantId) || 0)
      ));
      const candidateEntrants = (withCapacity.length ? withCapacity : eligibleEntrants)
        .map((entrantId) => ({
          entrantId,
          count: bucketCountsByEntrant.get(entrantId)?.[bucket] || 0,
        }));
      const minCount = Math.min(...candidateEntrants.map((candidate) => candidate.count));
      const lowestFilled = candidateEntrants.filter((candidate) => candidate.count === minCount);
      const chosen = lowestFilled[Math.floor(Math.random() * lowestFilled.length)];
      if (!chosen) {
        return null;
      }

      const competitorIndex = competitorIndexById.get(chosen.entrantId);
      if (competitorIndex === undefined) {
        return null;
      }

      nextCompetitors[competitorIndex] = {
        ...nextCompetitors[competitorIndex],
        [bucket]: [...nextCompetitors[competitorIndex][bucket], player.id],
      };
      bucketCountsByEntrant.set(chosen.entrantId, {
        ...bucketCountsByEntrant.get(chosen.entrantId),
        [bucket]: (bucketCountsByEntrant.get(chosen.entrantId)?.[bucket] || 0) + 1,
      });
      ownerByPlayerId.set(player.id, chosen.entrantId);
      assignedPlayerIds.add(player.id);
      return chosen.entrantId;
    }

    let failed = false;

    for (const match of candidateMatches) {
      const sides = [match.player1, match.player2].filter((player) => !isPlaceholderMatchPlayer(player));
      if (!sides.length) {
        continue;
      }

      const unassignedSides = shuffleArray(sides.filter((player) => !assignedPlayerIds.has(player.id)));
      if (!unassignedSides.length) {
        continue;
      }

      if (unassignedSides.length === 2) {
        const [firstSide, secondSide] = unassignedSides;
        const firstOwner = assignPlayerToEntrant(firstSide);
        if (!firstOwner) {
          failed = true;
          break;
        }
        const secondOwner = assignPlayerToEntrant(secondSide, firstOwner);
        if (!secondOwner) {
          failed = true;
          break;
        }
        continue;
      }

      const soloSide = unassignedSides[0];
      const opponent = sides.find((player) => player.id !== soloSide.id);
      const blockedEntrantId = opponent ? ownerByPlayerId.get(opponent.id) || null : null;
      if (!assignPlayerToEntrant(soloSide, blockedEntrantId)) {
        failed = true;
        break;
      }
    }

    if (failed) {
      continue;
    }

    const leftoverPlayers = shuffleArray(actualPlayers.filter((player) => !assignedPlayerIds.has(player.id)));
    for (const player of leftoverPlayers) {
      if (!assignPlayerToEntrant(player)) {
        failed = true;
        break;
      }
    }

    if (failed) {
      continue;
    }

    const hasConflict = (roundOne?.matches || []).some((match) => {
      if (isPlaceholderMatchPlayer(match.player1) || isPlaceholderMatchPlayer(match.player2)) {
        return false;
      }
      const leftOwner = ownerByPlayerId.get(match.player1.id);
      const rightOwner = ownerByPlayerId.get(match.player2.id);
      return Boolean(leftOwner && rightOwner && leftOwner === rightOwner);
    });

    if (hasConflict || assignedPlayerIds.size !== actualPlayers.length) {
      continue;
    }

    const sortedCompetitors = nextCompetitors.map((competitor) => ({
      ...competitor,
      seedIds: [...competitor.seedIds].sort((left, right) => (entrantOrder.get(left) ?? 999) - (entrantOrder.get(right) ?? 999)),
      qualifierIds: [...competitor.qualifierIds].sort((left, right) => (entrantOrder.get(left) ?? 999) - (entrantOrder.get(right) ?? 999)),
    }));

    return {
      competitors: sortedCompetitors,
      assignedSeedCount: allSeeds.length,
      assignedQualifierCount: allQualifiers.length,
    };
  }

  throw new Error("Automatic assignment could not find a valid draw. Try adding more entrants or refreshing the player list.");
}

function SiteHeader({ mode = "home", poolConfigured = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-nav">
      <div className="site-nav-top">
        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-primary-nav"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
        <Link className="admin-link mobile-admin-link" to="/admin" onClick={closeMenu}>Admin</Link>
      </div>
      <div className={`site-nav-center${menuOpen ? " mobile-open" : ""}`}>
        <nav id="site-primary-nav" className="site-menu" aria-label="Primary">
          {mode === "home" ? (
            <>
              <a className="site-menu-link" href="#overview" onClick={closeMenu}>Overview</a>
              <Link className="site-menu-link" to="/structure" onClick={closeMenu}>Structure</Link>
              <Link className="site-menu-link" to="/teams" onClick={closeMenu}>Entrants</Link>
              <Link className="site-menu-link" to="/winners" onClick={closeMenu}>Winners</Link>
            </>
          ) : (
            <>
              <Link className="site-menu-link" to="/" onClick={closeMenu}>Tournament</Link>
              <Link className={`site-menu-link${mode === "structure" ? " current" : ""}`} to="/structure" onClick={closeMenu}>Structure</Link>
              <Link className={`site-menu-link${mode === "entrants" ? " current" : ""}`} to="/teams" onClick={closeMenu}>Entrants</Link>
              <Link className={`site-menu-link${mode === "winners" ? " current" : ""}`} to="/winners" onClick={closeMenu}>Winners</Link>
            </>
          )}
        </nav>
        <Link className="admin-link desktop-admin-link" to="/admin" onClick={closeMenu}>Admin</Link>
      </div>
    </header>
  );
}

function formatFooterTimestamp(value) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SourceTag({ lastUpdatedAt = null, sourceLabel = SOURCE_LABEL, sourceUrl = "https://www.fifa.com/tournaments/mens/worldcup" }) {
  return (
    <div className="source-tag-shell">
      <a className="source-tag" href={sourceUrl} target="_blank" rel="noreferrer">
        Source: {sourceLabel}
        {lastUpdatedAt ? ` • Refreshed ${formatFooterTimestamp(lastUpdatedAt)}` : ""}
      </a>
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return <span className={`skeleton-block${className ? ` ${className}` : ""}`} aria-hidden="true" />;
}

function PublicPageSkeleton({ mode = "home", showHeroImage = false, showGrid = false, gridCount = 4 }) {
  const isHome = mode === "home";

  return (
    <main className="app-shell">
      <SiteHeader mode={mode} />
      <section className={`skeleton-panel${isHome ? " skeleton-panel-home" : " skeleton-panel-page"}`}>
        <div className="skeleton-stack">
          <SkeletonBlock className="skeleton-kicker" />
          <SkeletonBlock className={`skeleton-title ${isHome ? "skeleton-title-lg" : "skeleton-title-page"}`} />
          <SkeletonBlock className={`skeleton-title ${isHome ? "skeleton-title-md" : "skeleton-line-lg"}`} />
          {isHome ? (
            <>
              <SkeletonBlock className="skeleton-line skeleton-line-lg" />
              <SkeletonBlock className="skeleton-line skeleton-line-md" />
            </>
          ) : null}
          <div className="skeleton-actions">
            <SkeletonBlock className="skeleton-pill" />
            <SkeletonBlock className="skeleton-pill" />
            {isHome ? <SkeletonBlock className="skeleton-pill" /> : null}
          </div>
        </div>
        {showHeroImage ? <SkeletonBlock className="skeleton-image" /> : null}
      </section>
      <section className="skeleton-stat-grid">
        <SkeletonBlock className="skeleton-card" />
        <SkeletonBlock className="skeleton-card" />
        <SkeletonBlock className="skeleton-card" />
        <SkeletonBlock className="skeleton-card" />
      </section>
      {showGrid ? (
        <section className="skeleton-content-grid">
          {Array.from({ length: gridCount }, (_, index) => (
            <SkeletonBlock key={`${mode}-${index}`} className="skeleton-card skeleton-card-tall" />
          ))}
        </section>
      ) : null}
      <SourceTag />
    </main>
  );
}

function PublicErrorState({ mode = "home", title, message, lastUpdatedAt = null }) {
  return (
    <main className="app-shell">
      <SiteHeader mode={mode} />
      <section className="public-error-card">
        <p className="public-error-eyebrow">Unable to load</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="public-error-actions">
          <button
            type="button"
            className="public-error-button primary"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
          <Link className="public-error-button" to="/">
            Back to home
          </Link>
        </div>
      </section>
      <SourceTag lastUpdatedAt={lastUpdatedAt} />
    </main>
  );
}

function isActiveTournamentMatch(match) {
  return !isPlaceholderMatchPlayer(match?.player1) && !isPlaceholderMatchPlayer(match?.player2);
}

function getFixtureStages(snapshot) {
  return snapshot?.fixtureStages?.length ? snapshot.fixtureStages : (snapshot?.rounds || []);
}

function isOpenTournamentMatch(match) {
  return isActiveTournamentMatch(match) && (match.unfinished || !match.winnerId);
}

function getMatchResolutionLabel(match) {
  if (match?.note) {
    return match.note;
  }
  if (match?.decisionMethod === "extra-time") {
    return "Decided after extra time.";
  }
  if (match?.decisionMethod === "penalties") {
    return "Decided on penalties.";
  }
  return "";
}

function MatchCard({ match, showPhotos, ownershipByPlayerId, onPlayerSelect, onHeadToHeadOpen = null }) {
  const metaBits = [
    match.group ? `Group ${match.group}` : null,
    match.startDate ? `Date ${match.startDate.slice(0, 10)}` : null,
  ].filter(Boolean);
  const matchCentreUrl = normaliseExternalUrl(match.liveUrl || match.detailsUrl || "");
  const resolutionLabel = getMatchResolutionLabel(match);

  const renderSide = (player, won) => (
    <div className={won ? "match-side winner" : "match-side loser"}>
      <PlayerIdentity
        player={player}
        compact
        showPhoto={showPhotos}
        ownerName={ownershipByPlayerId?.get(player.id)?.entrantName || ""}
        onNameClick={onPlayerSelect}
      />
      <strong>{player.score}</strong>
    </div>
  );

  return (
    <article className="match-card">
      <div className="match-meta">
        <div className="match-meta-copy">
          <span>Match {match.number}</span>
          {metaBits.length ? (
            <small>{metaBits.join(" • ")}</small>
          ) : null}
        </div>
        <span>
          {isPlaceholderMatchPlayer(match.player1) || isPlaceholderMatchPlayer(match.player2)
            ? "Awaiting team"
            : match.unfinished
              ? "In play"
              : match.scheduledDate.slice(0, 10)}
        </span>
      </div>
      {matchCentreUrl || (onHeadToHeadOpen && isActiveTournamentMatch(match)) ? (
        <div className="match-card-actions">
          {matchCentreUrl ? (
            <a
              className="match-history-button"
              href={matchCentreUrl}
              target="_blank"
              rel="noreferrer"
            >
              Match centre
            </a>
          ) : null}
          <button
            type="button"
            className="match-history-button"
            onClick={(event) => {
              event.stopPropagation();
              onHeadToHeadOpen(match);
            }}
          >
            Recent meetings
          </button>
        </div>
      ) : null}
      {renderSide(match.player1, match.winnerId === match.player1.id)}
      {renderSide(match.player2, match.winnerId === match.player2.id)}
      {resolutionLabel ? <p className="match-note">{resolutionLabel}</p> : null}
    </article>
  );
}

function GroupFixtureList({ fixtures = [], ownershipByPlayerId = new Map() }) {
  if (!fixtures.length) {
    return <p className="group-fixture-empty">Fixtures have not been published for this group yet.</p>;
  }

  return (
    <div className="group-fixture-list">
      {fixtures.map((match) => (
        <article key={match.id} className="group-fixture-item">
          <div className="group-fixture-top">
            <span>Match {match.number}</span>
            <small>{match.scheduledDate || match.startDate || ""}</small>
          </div>
          <div className="group-fixture-scoreline">
            <div className="group-fixture-team group-fixture-team-home">
              {match.player1.name}
              {ownershipByPlayerId.get(match.player1.id)?.entrantName ? (
                <small className="group-team-owner">{ownershipByPlayerId.get(match.player1.id).entrantName}</small>
              ) : null}
            </div>
            <strong className="group-fixture-score">{match.player1.score} - {match.player2.score}</strong>
            <div className="group-fixture-team group-fixture-team-away">
              {match.player2.name}
              {ownershipByPlayerId.get(match.player2.id)?.entrantName ? (
                <small className="group-team-owner">{ownershipByPlayerId.get(match.player2.id).entrantName}</small>
              ) : null}
            </div>
          </div>
          {getMatchResolutionLabel(match) ? (
            <p className="group-fixture-note">{getMatchResolutionLabel(match)}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function GroupStageSection({ group, showPhotos = true, ownershipByPlayerId = new Map() }) {
  return (
    <article key={group.key} className="group-standings-card group-stage-card">
      <div className="group-standings-header group-stage-header">
        <div>
          <p className="eyebrow">Group</p>
          <h3>{group.name}</h3>
        </div>
        <span className="group-stage-fixture-count">{group.fixtures.length} matches</span>
      </div>

      <div className="group-table-shell">
        <table className="group-table">
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">P</th>
              <th scope="col">W</th>
              <th scope="col">D</th>
              <th scope="col">L</th>
              <th scope="col">GF</th>
              <th scope="col">GA</th>
              <th scope="col">GD</th>
              <th scope="col">Pts</th>
            </tr>
          </thead>
          <tbody>
            {group.standings.map((row) => (
              <tr key={row.team.id}>
                <td>
                  <div className="group-table-team">
                    {showPhotos && row.team.photo ? (
                      <img className="group-table-team-photo" src={row.team.photo} alt="" loading="lazy" />
                    ) : (
                      <NationalityFlag nationality={row.team.nationality} className="group-table-team-flag" />
                    )}
                    <div className="group-table-team-copy">
                      <strong>{row.team.name}</strong>
                      {ownershipByPlayerId.get(row.team.id)?.entrantName ? (
                        <small className="group-team-owner">{ownershipByPlayerId.get(row.team.id).entrantName}</small>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{row.goalsFor}</td>
                <td>{row.goalsAgainst}</td>
                <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                <td><strong>{row.points}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="group-fixture-section">
        <div className="group-fixture-header">
          <p className="eyebrow">Matches</p>
          <span>{group.fixtures.length}</span>
        </div>
        <GroupFixtureList fixtures={group.fixtures} ownershipByPlayerId={ownershipByPlayerId} />
      </div>
    </article>
  );
}

function formatHeadToHeadDate(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function HeadToHeadDialog({ state, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const forceRefresh = refreshNonce > 0;

    async function loadHeadToHead() {
      try {
        setLoading(true);
        setError("");
        const response = await fetchHeadToHead(state.player1.id, state.player2.id, state.year, { forceRefresh });
        if (!cancelled) {
          setData(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Head-to-head history is unavailable.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadHeadToHead();
    return () => {
      cancelled = true;
    };
  }, [state, refreshNonce]);

  const matches = data?.matches || [];
  const player1Wins = data?.summary?.player1Wins || 0;
  const player2Wins = data?.summary?.player2Wins || 0;

  return (
    <div className="player-bio-backdrop" onClick={onClose} role="presentation">
      <section
        className="player-bio-dialog head-to-head-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="head-to-head-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="player-bio-close" onClick={onClose} aria-label="Close meeting history">
          ×
        </button>
        <div className="head-to-head-header">
          <div>
            <p className="eyebrow">Recent meetings</p>
            <h2 id="head-to-head-title">{state.player1.name} vs {state.player2.name}</h2>
            <p className="player-bio-subtitle">
              <span>{data?.competitionLabel || "International fixtures"}</span>
              <span>Sample history</span>
            </p>
          </div>
          <RefreshButton
            onClick={() => {
              setRefreshing(true);
              setRefreshNonce((current) => current + 1);
            }}
            busy={refreshing}
            label="Refresh recent meetings"
            className="dialog-refresh-button"
          />
        </div>

        {loading ? <p className="status-banner">Loading meeting history...</p> : null}
        {error ? <p className="status-banner error">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div className="head-to-head-summary">
              <div>
                <span>{state.player1.name}</span>
                <small>Wins</small>
                <strong>{player1Wins}</strong>
              </div>
              <div>
                <span>Meetings</span>
                <strong>{matches.length}</strong>
              </div>
              <div>
                <span>{state.player2.name}</span>
                <small>Wins</small>
                <strong>{player2Wins}</strong>
              </div>
            </div>

            {matches.length ? (
              <div className="head-to-head-list">
                {matches.map((historyMatch) => {
                  const player1Won = historyMatch.winnerId === state.player1.id;
                  const player2Won = historyMatch.winnerId === state.player2.id;
                  return (
                    <article key={historyMatch.id} className="head-to-head-item">
                      <div className="head-to-head-item-top">
                        <strong>{historyMatch.eventName}</strong>
                        <span>{formatHeadToHeadDate(historyMatch.scheduledDate || historyMatch.startDate)}</span>
                      </div>
                      <div className="head-to-head-item-score">
                        <span className={player1Won ? "winner" : ""}>{state.player1.name}</span>
                        <strong>{historyMatch.score1} - {historyMatch.score2}</strong>
                        <span className={player2Won ? "winner" : ""}>{state.player2.name}</span>
                      </div>
                      {historyMatch.note ? <p className="match-note head-to-head-note">{historyMatch.note}</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="status-banner">No sample meetings are stored for this pairing yet.</p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}

function PlayerBioDialog({ player, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const foundedLabel = formatPlayerBirthDate(player?.born);
  const twitterUrl = player?.twitter ? `https://x.com/${String(player.twitter).replace(/^@/, "")}` : "";
  const externalUrl = normaliseExternalUrl(player?.websiteUrl);
  const photoSource = String(player?.photoSource || "").trim();

  if (!player) {
    return null;
  }

  return (
    <div className="player-bio-backdrop" onClick={onClose} role="presentation">
      <section
        className="player-bio-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-bio-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="player-bio-close" onClick={onClose} aria-label="Close team profile">
          ×
        </button>
        <div className="player-bio-header">
          {player.photo ? (
            <img className="player-bio-photo" src={player.photo} alt="" />
          ) : (
            <div className="player-bio-photo fallback" aria-hidden="true">
              {String(player.name || "?").trim().slice(0, 1)}
            </div>
          )}
            <div className="player-bio-copy">
            <p className="eyebrow">Team profile</p>
            <h2 id="player-bio-title">{player.name}</h2>
            <p className="player-bio-subtitle">
              <NationalityFlag nationality={player?.nationality} className="player-flag" />
              <span>{player.nationality || "Unknown nationality"}</span>
            </p>
          </div>
        </div>
        <div className="player-bio-grid">
          {player.nickname ? <div><span>Nickname</span><strong>{player.nickname}</strong></div> : null}
          {foundedLabel ? <div><span>Federation founded</span><strong>{foundedLabel}</strong></div> : null}
          {player.group ? <div><span>Group</span><strong>{player.group}</strong></div> : null}
          {player.confederation ? <div><span>Confederation</span><strong>{player.confederation}</strong></div> : null}
          <div><span>World Cup titles</span><strong>{player.numRankingTitles || 0}</strong></div>
        </div>
        {player.info ? (
          <div className="player-bio-info-block">
            <span>Info</span>
            <p className="player-bio-info">{player.info}</p>
          </div>
        ) : null}
        {(twitterUrl || externalUrl) ? (
          <div className="player-bio-links">
            {twitterUrl ? <a href={twitterUrl} target="_blank" rel="noreferrer">Twitter/X</a> : null}
            {externalUrl ? <a href={externalUrl} target="_blank" rel="noreferrer">Profile link</a> : null}
          </div>
        ) : null}
        {photoSource ? <p className="player-bio-source">Photo source: {photoSource}</p> : null}
      </section>
    </div>
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
        <span className="admin-player-chip">{player.isSeed ? SEED_LABEL : QUALIFIER_LABEL}</span>
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
  assignablePlayers,
  onAssign,
  assignLabel,
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState("");

  useEffect(() => {
    if (!assignablePlayers?.some((player) => String(player.id) === selectedPlayerId)) {
      setSelectedPlayerId("");
    }
  }, [assignablePlayers, selectedPlayerId]);

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
      {assignablePlayers?.length && onAssign ? (
        <div className="admin-lane-assign">
          <label className="toolbar-select-shell admin-select-shell">
            <select
              className="toolbar-select"
              value={selectedPlayerId}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
              aria-label={assignLabel || `Add player to ${title}`}
            >
              <option value="">{assignLabel || "Add player"}</option>
              {assignablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-secondary-button admin-inline-add-button"
            onClick={() => {
              if (!selectedPlayerId) {
                return;
              }
              onAssign(Number(selectedPlayerId), bucket);
              setSelectedPlayerId("");
            }}
            disabled={!selectedPlayerId}
          >
            Add
          </button>
        </div>
      ) : null}
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

function getDefaultRoundKey(snapshot) {
  const rounds = snapshot?.rounds || [];
  if (!rounds.length) {
    return "";
  }

  const firstIncompleteRound = rounds.find((round) => (
    round.matches.length > 0
      && round.matches.some((match) => isOpenTournamentMatch(match))
  ));
  if (firstIncompleteRound) {
    return firstIncompleteRound.key;
  }

  const latestStartedRound = [...rounds].reverse().find((round) => round.matches.some((match) => isActiveTournamentMatch(match)));
  return latestStartedRound?.key || rounds[0].key;
}

function getDefaultStructureMode(snapshot) {
  const groupStage = getFixtureStages(snapshot).find((stage) => stage.key === "group-stage") || null;
  const groupMatches = groupStage?.matches || [];
  const knockoutRounds = snapshot?.rounds || [];
  const knockoutStarted = knockoutRounds.some((round) => round.matches.some((match) => isActiveTournamentMatch(match)));
  const groupsStillActive = groupMatches.some((match) => isOpenTournamentMatch(match));

  if (knockoutStarted || (groupMatches.length && !groupsStillActive)) {
    return "knockout";
  }

  return "groups";
}

function buildOwnershipMap(competitors) {
  const ownershipByPlayerId = new Map();

  for (const competitor of competitors || []) {
    const assignedPlayers = [...(competitor.seeds || []), ...(competitor.qualifiers || [])];
    for (const player of assignedPlayers) {
      if (!player?.id || ownershipByPlayerId.has(player.id)) {
        continue;
      }
      ownershipByPlayerId.set(player.id, {
        entrantId: competitor.entrantId || competitor.name,
        entrantName: competitor.name,
        winningYears: competitor.winningYears || [],
      });
    }
  }

  return ownershipByPlayerId;
}

function createPendingBracketSide(label) {
  return {
    id: `pending-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    entrantName: "Awaiting entrant",
    playerName: label,
    playerNationality: "",
    playerPhoto: "",
    score: null,
    isPlaceholder: true,
    isUnassigned: false,
  };
}

function createBracketSideFromPlayer(player, ownershipByPlayerId) {
  if (!player || isPlaceholderMatchPlayer(player)) {
    return createPendingBracketSide("Awaiting player");
  }

  const owner = ownershipByPlayerId.get(player.id);
  return {
    id: player.id,
    entrantName: owner?.entrantName || "Unassigned entrant",
    winningYears: owner?.winningYears || [],
    playerName: player.name,
    playerNationality: player.nationality || player.name,
    playerPhoto: player.photo || "",
    score: Number.isFinite(Number(player.score)) ? Number(player.score) : null,
    isPlaceholder: false,
    isUnassigned: !owner,
  };
}

function deriveBracketSideFromPreviousMatch(previousMatch, fallbackLabel) {
  if (!previousMatch) {
    return createPendingBracketSide(fallbackLabel || "Awaiting result");
  }

  if (previousMatch.winnerSide) {
    return { ...previousMatch.winnerSide };
  }

  return createPendingBracketSide(`Winner of ${previousMatch.label}`);
}

function buildBracketRounds(snapshotRounds, competitors) {
  const ownershipByPlayerId = buildOwnershipMap(competitors);
  const builtRounds = [];

  for (const [roundIndex, round] of snapshotRounds.entries()) {
    const sortedMatches = [...(round.matches || [])].sort((left, right) => left.number - right.number);
    const expectedMatchCount = Math.max(
      sortedMatches.length,
      Math.max(1, Math.floor((round.entrantsLeft || 2) / 2)),
    );

    const bracketMatches = Array.from({ length: expectedMatchCount }, (_, matchIndex) => {
      const actualMatch = sortedMatches[matchIndex] || null;
      const previousRoundMatches = roundIndex > 0 ? builtRounds[roundIndex - 1]?.bracketMatches || [] : [];
      const leftFeeder = previousRoundMatches[matchIndex * 2];
      const rightFeeder = previousRoundMatches[matchIndex * 2 + 1];
      let side1;
      let side2;

      if (actualMatch) {
        side1 = !isPlaceholderMatchPlayer(actualMatch.player1)
          ? createBracketSideFromPlayer(actualMatch.player1, ownershipByPlayerId)
          : roundIndex === 0
            ? createPendingBracketSide("Awaiting draw")
            : deriveBracketSideFromPreviousMatch(leftFeeder, "Awaiting previous match");
        side2 = !isPlaceholderMatchPlayer(actualMatch.player2)
          ? createBracketSideFromPlayer(actualMatch.player2, ownershipByPlayerId)
          : roundIndex === 0
            ? createPendingBracketSide("Awaiting draw")
            : deriveBracketSideFromPreviousMatch(rightFeeder, "Awaiting previous match");
      } else if (roundIndex === 0) {
        side1 = createPendingBracketSide("Awaiting draw");
        side2 = createPendingBracketSide("Awaiting draw");
      } else {
        side1 = deriveBracketSideFromPreviousMatch(leftFeeder, "Awaiting previous match");
        side2 = deriveBracketSideFromPreviousMatch(rightFeeder, "Awaiting previous match");
      }

      const winnerSide = actualMatch?.winnerId
        ? [side1, side2].find((side) => side.id === actualMatch.winnerId) || null
        : null;

      return {
        key: `${round.key}-${matchIndex + 1}`,
        label: actualMatch ? `${round.shortLabel} ${actualMatch.number}` : `${round.shortLabel} ${matchIndex + 1}`,
        number: actualMatch?.number || matchIndex + 1,
        state: actualMatch ? (actualMatch.unfinished ? "in-play" : "finished") : "pending",
        scheduledDate: actualMatch?.scheduledDate || "",
        note: actualMatch?.note || "",
        slotSpan: 2 ** (roundIndex + 1),
        side1,
        side2,
        winnerSide,
      };
    });

    builtRounds.push({
      ...round,
      bracketMatches,
    });
  }

  return builtRounds;
}

function usePublicTournamentData(selectedYear) {
  const [data, setData] = useState(null);
  const [publicEntrants, setPublicEntrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const manualRefreshRequestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const forceRefresh = manualRefreshRequestedRef.current;
    manualRefreshRequestedRef.current = false;

    async function load(showLoadingState = true) {
      if (showLoadingState) {
        setLoading(true);
      }
      setError("");
      try {
        const [nextData, entrantsResponse] = await Promise.all([
          fetchPool(selectedYear, { forceRefresh }),
          fetchEntrants(),
        ]);
        if (!cancelled) {
          setData(nextData);
          setPublicEntrants(entrantsResponse.entrants || []);
          setLastUpdatedAt(nextData?.snapshot?.cache?.lastUpdatedAt || new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load tournament data.");
        }
      } finally {
        if (!cancelled) {
          if (showLoadingState) {
            setLoading(false);
          }
          if (forceRefresh) {
            setRefreshing(false);
          }
        }
      }
    }

    load();

    const refreshId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load(false);
      }
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, [selectedYear, refreshNonce]);

  function refresh() {
    manualRefreshRequestedRef.current = true;
    setRefreshing(true);
    setRefreshNonce((current) => current + 1);
  }

  return { data, publicEntrants, loading, error, refresh, refreshing, lastUpdatedAt };
}

function useTournamentOverview(selectedYear) {
  const {
    data,
    publicEntrants,
    loading,
    error,
    refresh,
    refreshing,
    lastUpdatedAt,
  } = usePublicTournamentData(selectedYear);
  const [selectedRoundKey, setSelectedRoundKey] = useState("");
  const autoSelectedRoundYearRef = useRef(null);

  useEffect(() => {
    if (!data?.snapshot?.rounds?.length) {
      return;
    }

    const preferredRoundKey = getDefaultRoundKey(data.snapshot);
    const roundExists = data.snapshot.rounds.some((round) => round.key === selectedRoundKey);
    const yearChanged = autoSelectedRoundYearRef.current !== data.snapshot.year;

    if (!selectedRoundKey || !roundExists) {
      setSelectedRoundKey(preferredRoundKey);
    }

    if (yearChanged) {
      autoSelectedRoundYearRef.current = data.snapshot.year;
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
    const registryById = new Map(publicEntrants.map((entrant) => [String(entrant.id), entrant]));
    const registryByName = new Map(publicEntrants.map((entrant) => [entrant.name.toLowerCase(), entrant]));
    const selectedRound = snapshot.rounds.find((round) => round.key === selectedRoundKey) || snapshot.rounds[0];
    const currentRound = snapshot.rounds.find((round) => round.key === getDefaultRoundKey(snapshot)) || selectedRound;
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

        let roundStatusLabel = TEAM_STATUS_LABEL;
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

    const decoratedCompetitors = competitors
      .map((competitor) => {
        const seeds = competitor.seeds.map((player) => entrantsById.get(player.id)).filter(Boolean);
        const qualifiers = competitor.qualifiers.map((player) => entrantsById.get(player.id)).filter(Boolean);

        return {
          ...competitor,
          winningYears: competitor.winningYears
            || registryById.get(String(competitor.entrantId))?.winningYears
            || registryByName.get(String(competitor.name).toLowerCase())?.winningYears
            || [],
          seeds,
          qualifiers,
          teamAssignments: [...seeds, ...qualifiers].sort((left, right) => (
            String(left?.name || "").localeCompare(String(right?.name || ""))
          )),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    const aliveEntrantsCount = Array.from(entrantsById.values()).filter((entry) => !entry.eliminated).length;
    const totalFieldSize = snapshot.rounds.reduce(
      (max, round) => Math.max(max, Number(round.entrantsLeft) || 0),
      snapshot.entrants.length,
    );
    const qualifiedEntrantsCount = snapshot.entrants.filter((entry) => !isPlaceholderEntrant(entry)).length;
    const spacesLeftCount = Math.max(0, totalFieldSize - qualifiedEntrantsCount);
    const hasTbdEntrants = spacesLeftCount > 0;
    const finalRound = snapshot.rounds[snapshot.rounds.length - 1] || null;
    const tournamentComplete = Boolean(finalRound?.matches?.length) && finalRound.matches.every((match) => Boolean(match.winnerId));
    const championPlayer = snapshot.entrants.find((entry) => entry.isChampion && !entry.isPlaceholder) || null;
    const winningCompetitor = championPlayer
      ? decoratedCompetitors.find((competitor) => (
        competitor.seeds.some((player) => player?.id === championPlayer.id)
        || competitor.qualifiers.some((player) => player?.id === championPlayer.id)
      )) || null
      : null;
    const unresolvedScheduledMatches = selectedRound.matches.filter((match) => !match.winnerId).length;
    const unplayedMatchCount = selectedRound.matches.length
      ? unresolvedScheduledMatches
      : (selectedRound.matchCount || 0);

    return {
      selectedRound,
      currentRound,
      aliveEntrantsCount,
      qualifiedEntrantsCount,
      spacesLeftCount,
      hasTbdEntrants,
      tournamentComplete,
      winningCompetitorName: winningCompetitor?.name || championPlayer?.name || "",
      championPlayerName: championPlayer?.name || "",
      unplayedMatchCount,
      decoratedCompetitors,
    };
  }, [data, publicEntrants, selectedRoundKey]);

  return {
    data,
    loading,
    error,
    refresh,
    refreshing,
    lastUpdatedAt,
    selectedRoundKey,
    setSelectedRoundKey,
    derived,
  };
}

function TournamentStructurePage() {
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const [structureMode, setStructureMode] = useSessionState(STRUCTURE_MODE_SESSION_KEY, "groups");
  const [structureModeYear, setStructureModeYear] = useSessionState(STRUCTURE_MODE_YEAR_SESSION_KEY, null);
  const { data, loading, error, refresh, refreshing, lastUpdatedAt } = usePublicTournamentData(selectedYear);
  const isCompactViewport = useIsCompactViewport();
  const isVeryCompactViewport = useIsCompactViewport(480);

  const bracketDerived = useMemo(() => {
    if (!data?.snapshot?.rounds?.length) {
      return null;
    }

    const activeRoundKey = getDefaultRoundKey(data.snapshot);
    const bracketRounds = buildBracketRounds(data.snapshot.rounds, data.competitors || []);
    const finalRound = data.snapshot.rounds[data.snapshot.rounds.length - 1] || null;
    const tournamentComplete = Boolean(finalRound?.matches?.length) && finalRound.matches.every((match) => Boolean(match.winnerId));
    const championPlayer = data.snapshot.entrants.find((entry) => entry.isChampion && !entry.isPlaceholder) || null;
    const winningCompetitor = championPlayer
      ? (data.competitors || []).find((competitor) => (
        competitor.seeds.some((player) => player?.id === championPlayer.id)
        || competitor.qualifiers.some((player) => player?.id === championPlayer.id)
      )) || null
      : null;
    const completedMatches = bracketRounds.reduce(
      (count, round) => count + round.bracketMatches.filter((match) => match.state === "finished").length,
      0,
    );

    return {
      activeRoundKey,
      bracketRounds,
      completedMatches,
      tournamentComplete,
      winningCompetitorName: winningCompetitor?.name || championPlayer?.name || "",
      championPlayerName: championPlayer?.name || "",
    };
  }, [data]);
  const ownershipByPlayerId = useMemo(
    () => buildOwnershipMap(data?.competitors || []),
    [data?.competitors],
  );

  useEffect(() => {
    if (!data?.snapshot) {
      return;
    }

    const defaultMode = getDefaultStructureMode(data.snapshot);
    if (structureModeYear !== data.snapshot.year) {
      setStructureMode(defaultMode);
      setStructureModeYear(data.snapshot.year);
    }
  }, [data?.snapshot, setStructureMode, setStructureModeYear, structureModeYear]);

  if (loading && !data) {
    return <PublicPageSkeleton mode="structure" showGrid gridCount={4} />;
  }

  if (!data) {
    return (
      <PublicErrorState
        mode="structure"
        title="Tournament structure is unavailable"
        message={error || "The structure page could not be loaded right now."}
        lastUpdatedAt={lastUpdatedAt}
      />
    );
  }

  const groups = data.snapshot?.groups || [];
  const poolConfigured = data.poolConfigured !== false;
  const defaultMode = getDefaultStructureMode(data.snapshot);
  const activeMode = structureMode === "knockout" ? "knockout" : "groups";
  const bracketUnit = isVeryCompactViewport ? 320 : isCompactViewport ? 280 : 208;
  const bracketHeight = bracketDerived?.bracketRounds?.[0]?.bracketMatches?.length
    ? bracketDerived.bracketRounds[0].bracketMatches.length * bracketUnit
    : 0;

  return (
    <main className="app-shell bracket-page-shell">
      <SiteHeader mode="structure" poolConfigured={poolConfigured} />

      <section className="bracket-hero-card">
        <div className="bracket-hero-copy">
          <p className="hero-kicker">Tournament structure</p>
          <h1>{BRAND_SHORT_NAME} Structure</h1>
          <p className="bracket-hero-note">
            {activeMode === "groups"
              ? "Group tables and grouped fixtures"
              : "Knockout tree and progression"}
          </p>
          <p className="structure-phase-note">
            Auto phase: {defaultMode === "groups" ? "Groups" : "Knockout"}
          </p>
        </div>
        <div className="matches-hero-tools structure-hero-tools">
          <div className="matches-settings-shell entrants-settings-shell structure-refresh-shell">
            <RefreshButton onClick={refresh} busy={refreshing} label={`Refresh ${selectedYear} structure data`} />
          </div>
          <div className="bracket-toolbar bracket-toolbar-compact structure-toolbar">
            <div className="bracket-control bracket-control-year">
              <p className="toolbar-label">Year</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
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
            </div>
            <div className="bracket-control structure-mode-control">
              <p className="toolbar-label">Mode</p>
              <div className="structure-mode-switch" role="tablist" aria-label="Tournament structure mode">
                <div className="structure-mode-label-row" aria-hidden="true">
                  <span className={`structure-mode-side-label${activeMode === "groups" ? " active" : ""}`}>Group</span>
                  <span className={`structure-mode-side-label${activeMode === "knockout" ? " active" : ""}`}>Knockout</span>
                </div>
                <div className="structure-mode-button-row">
                  <button
                    type="button"
                    className={`structure-mode-option${activeMode === "groups" ? " active" : ""}`}
                    onClick={() => {
                      setStructureMode("groups");
                      setStructureModeYear(selectedYear);
                    }}
                    aria-selected={activeMode === "groups"}
                    aria-label="Show group structure"
                  />
                  <button
                    type="button"
                    className={`structure-mode-option${activeMode === "knockout" ? " active" : ""}`}
                    onClick={() => {
                      setStructureMode("knockout");
                      setStructureModeYear(selectedYear);
                    }}
                    aria-selected={activeMode === "knockout"}
                    aria-label="Show knockout structure"
                  />
                </div>
              </div>
            </div>
            <div className="bracket-control structure-summary-control">
              <span className="bracket-inline-label">{activeMode === "groups" ? "Stage coverage" : "Completed"}</span>
              <strong className="bracket-inline-value">
                {activeMode === "groups"
                  ? `${groups.length} groups`
                  : (bracketDerived?.tournamentComplete
                    ? `${bracketDerived.winningCompetitorName}${bracketDerived.championPlayerName ? ` (${bracketDerived.championPlayerName})` : ""}`
                    : bracketDerived?.completedMatches || 0)}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The pool is not fully configured yet. Teams without an owner are shown as unassigned until they are allocated to an entrant.
        </p>
      ) : null}

      <section className="section-heading">
        <div>
          <p className="eyebrow">{activeMode === "groups" ? "Group Stage" : "Progression View"}</p>
          <h2>{activeMode === "groups" ? `${selectedYear} groups` : data.snapshot.eventName}</h2>
          {activeMode === "groups" ? (
            <p className="section-support-copy">
              {groups.length} groups, {groups.reduce((total, group) => total + group.fixtures.length, 0)} matches
            </p>
          ) : (
            <p className="section-support-copy">
              {bracketDerived?.bracketRounds?.length || 0} rounds, {bracketDerived?.completedMatches || 0} matches completed
            </p>
          )}
        </div>
      </section>

      {activeMode === "groups" ? (
        groups.length ? (
          <section className="group-stage-grid">
            {groups.map((group) => (
              <GroupStageSection key={group.key} group={group} showPhotos ownershipByPlayerId={ownershipByPlayerId} />
            ))}
          </section>
        ) : (
          <p className="status-banner">Group tables have not been published for this tournament year yet.</p>
        )
      ) : (
        bracketDerived ? (
          <section className="bracket-board-shell">
            <div className="bracket-board">
              {bracketDerived.bracketRounds.map((round, roundIndex) => (
                <section
                  key={round.key}
                  className={`bracket-round-column${round.key === bracketDerived.activeRoundKey ? " active" : ""}`}
                >
                  <div className="bracket-round-header">
                    <p className="eyebrow">Stage</p>
                    <h3>{round.name}</h3>
                    <span>{round.bracketMatches.length} fixtures</span>
                  </div>
                  <div className="bracket-round-stack" style={{ minHeight: `${bracketHeight}px` }}>
                    {round.bracketMatches.map((match, matchIndex) => {
                      const winnerId = match.winnerSide?.id || null;
                      const topOffset = (((2 ** roundIndex) - 1) * bracketUnit) / 2;
                      const top = topOffset + matchIndex * (2 ** roundIndex) * bracketUnit;

                      return (
                        <div
                          key={match.key}
                          className={`bracket-match-slot${roundIndex > 0 ? " has-left-connector" : ""}${roundIndex < bracketDerived.bracketRounds.length - 1 ? " has-right-connector" : ""}`}
                          style={{ top: `${top}px` }}
                        >
                          <article className={`bracket-match-card ${match.state}`}>
                            <div className="bracket-match-meta">
                              <div>
                                <span>{match.label}</span>
                                {match.scheduledDate ? <small>{match.scheduledDate.slice(0, 10)}</small> : null}
                              </div>
                              {match.state === "finished" ? <strong>Complete</strong> : match.state === "in-play" ? <strong>Live</strong> : null}
                            </div>

                            {[match.side1, match.side2].map((side) => (
                              <div
                                key={`${match.key}-${side.id}`}
                                className={`bracket-side-row${side.id === winnerId ? " winner" : ""}${winnerId && side.id !== winnerId ? " loser" : ""}${side.isPlaceholder ? " placeholder" : ""}${side.isUnassigned ? " unassigned" : ""}`}
                              >
                            <div className="bracket-side-copy">
                              <span className="bracket-player-name">
                                {!side.isPlaceholder && side.playerPhoto ? (
                                  <img className="bracket-team-flag" src={side.playerPhoto} alt="" aria-hidden="true" />
                                ) : !side.isPlaceholder ? (
                                  <NationalityFlag nationality={side.playerNationality || side.playerName} className="bracket-team-flag" />
                                ) : null}
                                <span>{side.playerName}</span>
                              </span>
                              <span className="bracket-entrant-name">
                                <span>{side.entrantName}</span>
                                {(side.winningYears || []).length ? (
                                  <span className="bracket-entrant-crowns" aria-label={`${side.winningYears.length} wins`}>
                                    {side.winningYears.map((year) => (
                                      <img
                                        key={`${side.id}-${year}`}
                                        className="competitor-crown"
                                        src={crownIcon}
                                        alt=""
                                        aria-hidden="true"
                                        title={`Winner ${year}`}
                                      />
                                    ))}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                                {side.score !== null ? <span className="bracket-side-score">{side.score}</span> : null}
                              </div>
                            ))}
                            {match.note ? <p className="match-note bracket-match-note">{match.note}</p> : null}
                          </article>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        ) : (
          <p className="status-banner">Knockout data is unavailable for this tournament year.</p>
        )
      )}

      <SourceTag lastUpdatedAt={lastUpdatedAt} sourceLabel={data.snapshot.dataSourceLabel || SOURCE_LABEL} sourceUrl={data.snapshot.dataSourceUrl} />
    </main>
  );
}

function HomePage() {
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const {
    data,
    loading,
    error,
    refresh,
    refreshing,
    lastUpdatedAt,
    selectedRoundKey,
    setSelectedRoundKey,
    derived,
  } = useTournamentOverview(selectedYear);

  if (loading && !data) {
    return <PublicPageSkeleton mode="home" showHeroImage />;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return (
      <PublicErrorState
        mode="home"
        title="Tournament data is unavailable"
        message={error || "The live tournament overview could not be loaded right now."}
        lastUpdatedAt={lastUpdatedAt}
      />
    );
  }

  const { snapshot } = data;
  const {
    selectedRound,
    currentRound,
    aliveEntrantsCount,
    qualifiedEntrantsCount,
    spacesLeftCount,
    hasTbdEntrants,
    tournamentComplete,
    winningCompetitorName,
    championPlayerName,
    unplayedMatchCount,
  } = derived;
  const poolConfigured = data.poolConfigured !== false;
  const isYearSwitching = loading && Boolean(data) && data.snapshot?.year !== selectedYear;
  const isUpcomingTournament = snapshot.dataSourceMode === "upcoming";

  return (
    <main className="app-shell">
      <SiteHeader mode="home" poolConfigured={poolConfigured} />

      {isYearSwitching ? (
        <p className="status-banner" aria-live="polite">
          Loading the {selectedYear} overview. You are still seeing {data.snapshot?.year} until the new tournament finishes loading.
        </p>
      ) : null}

      <section className="hero-card" id="overview">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-grid" />
        <div className="hero-header">
          <div className="hero-copy">
            <p className="hero-kicker">World Cup pool dashboard {selectedYear}</p>
            <h1>
              {BRAND_NAME}
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
            <div className="hero-actions">
              {poolConfigured ? <Link className="admin-pill-link" to="/teams">View teams</Link> : null}
              <Link className="admin-pill-link subtle" to="/structure">Open structure</Link>
              <Link className="admin-pill-link subtle" to="/winners">Open winners</Link>
            </div>
            <RefreshButton onClick={refresh} busy={refreshing} label={`Refresh ${selectedYear} tournament data`} className="hero-refresh-button" />
          </div>
        </div>
        <div className="hero-image-shell hero-tournament-mark" aria-hidden="true">
          <div className="tournament-mark-ball" />
          <div className="tournament-mark-copy">
            <span>{selectedYear}</span>
            <strong>{isUpcomingTournament ? "Host countdown" : "Final tournament"}</strong>
          </div>
        </div>
      </section>

      <section className="summary-strip">
        <article className="summary-card">
          <p className="toolbar-label">Event</p>
          <p className="summary-value">{BRAND_SHORT_NAME} {selectedYear}</p>
          {snapshot.dataSourceMode === "live" ? (
            <p className="summary-copy">Live data from football-data.org</p>
          ) : null}
          {snapshot.dataSourceMode === "fallback-static" ? (
            <p className="summary-copy">Using static {snapshot.sampleDataYear} fallback data</p>
          ) : null}
          {isUpcomingTournament ? (
            <p className="summary-copy">Tournament field and fixtures have not been published yet</p>
          ) : null}
        </article>
        <article className="summary-card">
          <p className="toolbar-label">Current knockout round</p>
          <p className="summary-value">
            {isUpcomingTournament ? "Not drawn yet" : tournamentComplete ? "Completed" : hasTbdEntrants ? "Awaiting qualifiers" : currentRound.name}
          </p>
        </article>
        <article className="summary-card">
          <p className="toolbar-label">{tournamentComplete ? "Pool winner" : hasTbdEntrants ? "Qualified so far" : "Teams alive"}</p>
          <p className="summary-value">
            {tournamentComplete
              ? `${winningCompetitorName}${championPlayerName ? ` (${championPlayerName})` : ""}`
              : hasTbdEntrants
                ? qualifiedEntrantsCount
                : aliveEntrantsCount}
          </p>
          <p className="summary-copy">
            {isUpcomingTournament
              ? "Waiting for the final 2026 field"
              : tournamentComplete
              ? `Champion of the pool for ${selectedYear}`
              : hasTbdEntrants
                ? `${spacesLeftCount} space${spacesLeftCount === 1 ? "" : "s"} left to fill`
              : "Still live in the knockout draw"}
          </p>
        </article>
        <article className="summary-card">
          <p className="toolbar-label">Matches remaining</p>
          <p className="summary-value">{unplayedMatchCount}</p>
          <p className="summary-copy">{isUpcomingTournament ? "No matches published yet" : `Still to be played in ${selectedRound.name}`}</p>
        </article>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          {isUpcomingTournament
            ? `The ${selectedYear} World Cup is being held as an upcoming shell only for now. Add entrants later once teams and fixtures are confirmed.`
            : `The ${selectedYear} pool is not fully configured yet. Team data is still available below, and you can finish the assignment setup from admin.`}
        </p>
      ) : null}

      <SourceTag lastUpdatedAt={lastUpdatedAt} sourceLabel={snapshot.dataSourceLabel || SOURCE_LABEL} sourceUrl={snapshot.dataSourceUrl} />

    </main>
  );
}

function EntrantsPage() {
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const [showPhotos, setShowPhotos] = usePublicShowPhotos();
  const { data, loading, error, derived, refresh, refreshing, lastUpdatedAt } = useTournamentOverview(selectedYear);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useSessionState(ENTRANTS_SORT_SESSION_KEY, "entrant");

  if (loading && !data) {
    return <PublicPageSkeleton mode="entrants" showGrid gridCount={4} />;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return (
      <PublicErrorState
        mode="entrants"
        title="Team data is unavailable"
        message={error || "The teams page could not be loaded right now."}
        lastUpdatedAt={lastUpdatedAt}
      />
    );
  }

  const poolConfigured = data.poolConfigured !== false;
  const { decoratedCompetitors } = derived;
  const unifiedAssignments = decoratedCompetitors.flatMap((competitor) => (
    competitor.teamAssignments.map((player, index) => ({
      ...player,
      entrantName: competitor.name,
      winningYears: competitor.winningYears || [],
      sortIndex: index,
    }))
  )).sort((left, right) => {
    if (sortBy === "team") {
      return (
        left.name.localeCompare(right.name)
        || left.entrantName.localeCompare(right.entrantName)
        || left.sortIndex - right.sortIndex
      );
    }

    return (
      left.entrantName.localeCompare(right.entrantName)
      || left.name.localeCompare(right.name)
      || left.sortIndex - right.sortIndex
    );
  });

  return (
    <main className="app-shell">
      <SiteHeader mode="entrants" poolConfigured={poolConfigured} />

      <section className="bracket-hero-card">
        <div className="bracket-hero-copy">
          <p className="hero-kicker">Entrants and assigned teams</p>
          <h1>{BRAND_SHORT_NAME} Teams</h1>
        </div>
        <div className="entrants-hero-tools">
          <div className="matches-settings-shell entrants-settings-shell">
            <RefreshButton onClick={refresh} busy={refreshing} label={`Refresh ${selectedYear} entrant data`} />
            <button
              type="button"
              className={`matches-settings-button${settingsMenuOpen ? " open" : ""}`}
              onClick={() => setSettingsMenuOpen((current) => !current)}
              aria-expanded={settingsMenuOpen}
              aria-controls="entrants-settings-panel"
              aria-label="Open team display settings"
              title="Team display settings"
            >
              <span className="matches-settings-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.63l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
                </svg>
              </span>
            </button>
            {settingsMenuOpen ? (
              <section id="entrants-settings-panel" className="matches-settings-panel entrants-settings-panel">
                <div className="matches-settings-panel-header">
                  <p className="eyebrow">Display</p>
                </div>
                <div className="matches-settings-control">
                  <span className="bracket-inline-label">Team badges</span>
                  <label className="toolbar-switch">
                    <input
                      type="checkbox"
                      checked={showPhotos}
                      onChange={(event) => setShowPhotos(event.target.checked)}
                    />
                    <span className="toolbar-switch-track">
                      <span className="toolbar-switch-thumb" />
                    </span>
                    <span className="toolbar-switch-label">{showPhotos ? "On" : "Off"}</span>
                  </label>
                </div>
              </section>
            ) : null}
          </div>
          <div className="bracket-toolbar entrants-toolbar-top">
            <div className="bracket-control bracket-control-year">
              <p className="toolbar-label">Year</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
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
            </div>
            <div className="bracket-control">
              <span className="bracket-inline-label">Pool entrants</span>
              <strong className="bracket-inline-value">{decoratedCompetitors.length}</strong>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The pool is not fully configured yet. Entrant cards will appear here once the knockout teams have been assigned.
        </p>
      ) : null}

      {poolConfigured ? (
        <>
          <section className="section-heading">
            <div>
              <p className="eyebrow">Entrants</p>
              <h2>{decoratedCompetitors.length} pool entrants</h2>
              <p className="section-support-copy">One unified list of assignments, with entrant shown first and team alongside it.</p>
            </div>
            <div className="assignment-sort-control">
              <p className="toolbar-label">Sort by</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  aria-label="Sort assignments"
                >
                  <option value="entrant">Entrant</option>
                  <option value="team">Team</option>
                </select>
              </label>
            </div>
          </section>
          <section className="assignment-list-card">
            <ul className="assignment-list">
              {unifiedAssignments.map((player) => (
                <li key={player.id} className={player.eliminated ? "pick-row assignment-row eliminated" : "pick-row assignment-row"}>
                  <div className="assignment-main">
                    <div className={`assignment-line${player.eliminated ? " eliminated" : ""}`}>
                      <span className="assignment-entrant">{player.entrantName}</span>
                      {(player.winningYears || []).length ? (
                        <span className="bracket-entrant-crowns" aria-label={`${player.winningYears.length} wins`}>
                          {player.winningYears.map((year) => (
                            <img
                              key={`${player.id}-${year}`}
                              className="competitor-crown"
                              src={crownIcon}
                              alt=""
                              aria-hidden="true"
                              title={`Winner ${year}`}
                            />
                          ))}
                        </span>
                      ) : null}
                      <span className="assignment-separator" aria-hidden="true">/</span>
                      {showPhotos ? (
                        player.photo ? (
                          <img className="assignment-flag" src={player.photo} alt="" loading="lazy" />
                        ) : (
                          <NationalityFlag nationality={player.nationality} className="assignment-flag" />
                        )
                      ) : null}
                      <strong>{player.name}</strong>
                    </div>
                    <small>{TEAM_ASSIGNMENT_LABEL}</small>
                  </div>
                  <span className={`pick-status ${player.statusTone}`}>{player.roundStatusLabel}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <SourceTag lastUpdatedAt={lastUpdatedAt} sourceLabel={data.snapshot.dataSourceLabel || SOURCE_LABEL} sourceUrl={data.snapshot.dataSourceUrl} />
    </main>
  );
}

function MatchesPage() {
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const { data, loading, error, refresh, refreshing, lastUpdatedAt } = usePublicTournamentData(selectedYear);
  const [selectedRoundKey, setSelectedRoundKey] = useSessionState(MATCHES_ROUND_SESSION_KEY, "");
  const [selectedEntrantFiltersRaw, setSelectedEntrantFilters] = useSessionState(MATCHES_ENTRANT_FILTERS_SESSION_KEY, []);
  const [selectedPlayerFiltersRaw, setSelectedPlayerFilters] = useSessionState(MATCHES_PLAYER_FILTERS_SESSION_KEY, []);
  const [selectedCountryFiltersRaw, setSelectedCountryFilters] = useSessionState(MATCHES_COUNTRY_FILTERS_SESSION_KEY, []);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [selectedBioPlayer, setSelectedBioPlayer] = useState(null);
  const [selectedHeadToHead, setSelectedHeadToHead] = useState(null);
  const [showPhotos, setShowPhotos] = usePublicShowPhotos();
  const [displayRoundKey, setDisplayRoundKey] = useState("");
  const autoSelectedRoundYearRef = useRef(null);
  const selectedEntrantFilters = normaliseSessionList(selectedEntrantFiltersRaw);
  const selectedPlayerFilters = normaliseSessionList(selectedPlayerFiltersRaw);
  const selectedCountryFilters = normaliseSessionList(selectedCountryFiltersRaw);
  const snapshotRounds = getFixtureStages(data?.snapshot);
  const selectedRoundSnapshot = snapshotRounds.find((round) => round.key === selectedRoundKey) || snapshotRounds[0] || null;
  const selectedRoundMatches = selectedRoundSnapshot?.matches || [];

  useEffect(() => {
    if (!snapshotRounds.length) {
      return;
    }

    const preferredRoundKey = snapshotRounds[0]?.key || "";
    const roundExists = snapshotRounds.some((round) => round.key === selectedRoundKey);
    const yearChanged = autoSelectedRoundYearRef.current !== data.snapshot?.year;

    if (!selectedRoundKey || !roundExists) {
      setSelectedRoundKey(preferredRoundKey);
    }

    if (yearChanged) {
      autoSelectedRoundYearRef.current = data.snapshot?.year;
    }
  }, [data, selectedRoundKey, snapshotRounds]);

  useEffect(() => {
    if (!displayRoundKey && selectedRoundKey) {
      setDisplayRoundKey(selectedRoundKey);
    }
  }, [displayRoundKey, selectedRoundKey]);

  useEffect(() => {
    const firstRoundKey = snapshotRounds[0]?.key || "";
    if (!loading) {
      setDisplayRoundKey(selectedRoundKey || firstRoundKey);
    }
  }, [loading, selectedRoundKey, snapshotRounds]);

  const ownershipByPlayerId = useMemo(
    () => buildOwnershipMap(data?.competitors || []),
    [data?.competitors],
  );
  const entrantOptions = useMemo(
    () => [...new Set(
      selectedRoundMatches.flatMap((match) => [
        ownershipByPlayerId.get(match.player1.id)?.entrantName || "",
        ownershipByPlayerId.get(match.player2.id)?.entrantName || "",
      ])
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right)),
    [ownershipByPlayerId, selectedRoundMatches],
  );
  const playerOptions = useMemo(
    () => [...new Set(
      selectedRoundMatches.flatMap((match) => [
        match.player1?.name || "",
        match.player2?.name || "",
      ]).filter(Boolean),
    )].sort((left, right) => left.localeCompare(right)),
    [selectedRoundMatches],
  );
  const countryOptions = useMemo(
    () => [...new Set(
      selectedRoundMatches.flatMap((match) => [
        match.player1?.nationality || "",
        match.player2?.nationality || "",
      ]).filter(Boolean),
    )].sort((left, right) => left.localeCompare(right)),
    [selectedRoundMatches],
  );

  useEffect(() => {
    const nextFilters = selectedEntrantFilters.filter((entrantName) => entrantOptions.includes(entrantName));
    if (JSON.stringify(nextFilters) !== JSON.stringify(selectedEntrantFiltersRaw)) {
      setSelectedEntrantFilters(nextFilters);
    }
  }, [entrantOptions, selectedEntrantFilters, selectedEntrantFiltersRaw, setSelectedEntrantFilters]);

  useEffect(() => {
    const nextFilters = selectedPlayerFilters.filter((playerName) => playerOptions.includes(playerName));
    if (JSON.stringify(nextFilters) !== JSON.stringify(selectedPlayerFiltersRaw)) {
      setSelectedPlayerFilters(nextFilters);
    }
  }, [playerOptions, selectedPlayerFilters, selectedPlayerFiltersRaw, setSelectedPlayerFilters]);

  useEffect(() => {
    const nextFilters = selectedCountryFilters.filter((country) => countryOptions.includes(country));
    if (JSON.stringify(nextFilters) !== JSON.stringify(selectedCountryFiltersRaw)) {
      setSelectedCountryFilters(nextFilters);
    }
  }, [countryOptions, selectedCountryFilters, selectedCountryFiltersRaw, setSelectedCountryFilters]);

  if (loading && !data) {
    return <PublicPageSkeleton mode="matches" showGrid gridCount={5} />;
  }

  if (!data || !snapshotRounds.length) {
    return (
      <PublicErrorState
        mode="matches"
        title="Fixture data is unavailable"
        message={error || "The fixtures page could not be loaded right now."}
        lastUpdatedAt={lastUpdatedAt}
      />
    );
  }

  const { snapshot } = data;
  const selectedRound = snapshotRounds.find((round) => round.key === selectedRoundKey) || snapshotRounds[0];
  const displayRound = snapshotRounds.find((round) => round.key === displayRoundKey) || selectedRound;
  const isYearSwitching = loading && Boolean(data) && data.snapshot?.year !== selectedYear;
  const isRoundSwitching = displayRoundKey && selectedRoundKey !== displayRoundKey;
  const hideMatchesDuringSwitch = isYearSwitching || isRoundSwitching;
  const unresolvedScheduledMatches = selectedRound.matches.filter((match) => !match.winnerId).length;
  const unplayedMatchCount = selectedRound.matches.length
    ? unresolvedScheduledMatches
    : (selectedRound.matchCount || 0);
  const poolConfigured = data.poolConfigured !== false;
  const filteredMatches = selectedRound.matches.filter((match) => {
    const playerOneOwner = ownershipByPlayerId.get(match.player1.id)?.entrantName || "";
    const playerTwoOwner = ownershipByPlayerId.get(match.player2.id)?.entrantName || "";
    const playerNames = [
      match.player1?.name || "",
      match.player2?.name || "",
    ];
    const playerCountries = [
      match.player1?.nationality || "",
      match.player2?.nationality || "",
    ];

    const entrantMatches = !selectedEntrantFilters.length
      || selectedEntrantFilters.includes(playerOneOwner)
      || selectedEntrantFilters.includes(playerTwoOwner);
    const playerMatches = !selectedPlayerFilters.length
      || playerNames.some((name) => selectedPlayerFilters.includes(name));
    const countryMatches = !selectedCountryFilters.length
      || playerCountries.some((country) => selectedCountryFilters.includes(country));

    return entrantMatches && playerMatches && countryMatches;
  });
  const filteredUnplayedMatchCount = filteredMatches.filter((match) => !match.winnerId).length;
  const activeFilterCount = selectedEntrantFilters.length + selectedPlayerFilters.length + selectedCountryFilters.length;

  function toggleFilterItem(currentValues, nextValue, setter) {
    setter(
      currentValues.includes(nextValue)
        ? currentValues.filter((value) => value !== nextValue)
        : [...currentValues, nextValue],
    );
  }

  return (
    <main className="app-shell">
      <SiteHeader mode="matches" poolConfigured={poolConfigured} />

      <section className="bracket-hero-card matches-hero-card">
        <div className="bracket-hero-copy">
          <p className="hero-kicker">Full tournament schedule and results</p>
          <h1>{BRAND_SHORT_NAME} Fixtures</h1>
        </div>
        <div className="matches-hero-tools">
          <div className="matches-settings-shell">
            <RefreshButton onClick={refresh} busy={refreshing} label={`Refresh ${selectedYear} fixture data`} />
            <button
              type="button"
              className={`matches-settings-button${settingsMenuOpen ? " open" : ""}`}
              onClick={() => setSettingsMenuOpen((current) => !current)}
              aria-expanded={settingsMenuOpen}
              aria-controls="matches-settings-panel"
              aria-label="Open fixture settings"
              title="Fixture settings"
            >
              <span className="matches-settings-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.57.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.85a.5.5 0 0 0 .12.63l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.82 14.52a.5.5 0 0 0-.12.63l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.57-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
                </svg>
              </span>
            </button>
            {settingsMenuOpen ? (
              <section id="matches-settings-panel" className="matches-settings-panel">
                <div className="matches-settings-panel-header">
                  <p className="eyebrow">Display</p>
                </div>
                <div className="matches-settings-control">
                  <span className="bracket-inline-label">Team badges</span>
                  <label className="toolbar-switch">
                    <input
                      type="checkbox"
                      checked={showPhotos}
                      onChange={(event) => setShowPhotos(event.target.checked)}
                    />
                    <span className="toolbar-switch-track">
                      <span className="toolbar-switch-thumb" />
                    </span>
                    <span className="toolbar-switch-label">{showPhotos ? "On" : "Off"}</span>
                  </label>
                </div>
              </section>
            ) : null}
          </div>
          <div className="bracket-toolbar matches-toolbar-top">
            <div className="bracket-control bracket-control-year">
              <p className="toolbar-label">Year</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
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
            </div>
            <div className="bracket-control matches-toolbar-control">
              <p className="toolbar-label">Stage</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
                  value={selectedRound.key}
                  onChange={(event) => setSelectedRoundKey(event.target.value)}
                  aria-label="Select stage"
                >
                  {snapshotRounds.map((round) => (
                    <option key={round.key} value={round.key}>
                      {round.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="bracket-control matches-toolbar-control matches-toolbar-stat">
              <span className="bracket-inline-label">Open fixtures</span>
              <strong className="bracket-inline-value">
                {activeFilterCount ? filteredUnplayedMatchCount : unplayedMatchCount}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {hideMatchesDuringSwitch ? (
        <p className="status-banner" aria-live="polite">
          {isYearSwitching
            ? `Loading fixtures for ${selectedYear}...`
            : `Loading ${selectedRound.name}...`}
        </p>
      ) : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The pool is not fully configured yet. Fixture data is still available while the knockout assignments are completed.
        </p>
      ) : null}

      <section className="section-heading draw-heading">
        <div>
          <p className="eyebrow">Fixtures</p>
          <h2>{hideMatchesDuringSwitch ? displayRound.name : selectedRound.name}</h2>
        </div>
        <div className="matches-heading-actions">
          <button
            type="button"
            className={`matches-filter-button${filterMenuOpen ? " open" : ""}`}
            onClick={() => setFilterMenuOpen((current) => !current)}
            aria-expanded={filterMenuOpen}
            aria-controls="matches-filter-panel"
          >
            <span className="matches-filter-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>Filter</span>
            {activeFilterCount ? <strong>{activeFilterCount} active</strong> : null}
            <span className="matches-filter-toggle-icon" aria-hidden="true">
              {filterMenuOpen ? "▴" : "▾"}
            </span>
          </button>
        </div>
      </section>

      {filterMenuOpen ? (
        <section id="matches-filter-panel" className="matches-filter-panel">
          <div className="matches-filter-panel-header">
            <p className="eyebrow">Filter Fixtures</p>
            <div className="matches-filter-panel-actions">
              <button
                type="button"
                className="matches-filter-clear"
                onClick={() => {
                  setSelectedEntrantFilters([]);
                  setSelectedPlayerFilters([]);
                  setSelectedCountryFilters([]);
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="matches-filter-collapse"
                onClick={() => setFilterMenuOpen(false)}
                aria-label="Collapse filter menu"
                title="Collapse filter menu"
              >
                <span aria-hidden="true">▴</span>
              </button>
            </div>
          </div>
          <div className="matches-filter-group">
            <p className="matches-filter-label">Team name</p>
            <div className="matches-filter-scroll-list" role="listbox" aria-label="Filter by team name" aria-multiselectable="true">
              {playerOptions.map((playerName) => (
                <button
                  key={playerName}
                  type="button"
                  className={`matches-filter-list-item${selectedPlayerFilters.includes(playerName) ? " active" : ""}`}
                  onClick={() => toggleFilterItem(selectedPlayerFilters, playerName, setSelectedPlayerFilters)}
                  aria-pressed={selectedPlayerFilters.includes(playerName)}
                >
                  <span className="matches-filter-list-check" aria-hidden="true">
                    {selectedPlayerFilters.includes(playerName) ? "✓" : ""}
                  </span>
                  {playerName}
                </button>
              ))}
            </div>
          </div>
          <div className="matches-filter-group">
            <p className="matches-filter-label">Entrants</p>
            <div className="matches-filter-scroll-list" role="listbox" aria-label="Filter by entrant" aria-multiselectable="true">
              {entrantOptions.map((entrantName) => (
                <button
                  key={entrantName}
                  type="button"
                  className={`matches-filter-list-item${selectedEntrantFilters.includes(entrantName) ? " active" : ""}`}
                  onClick={() => toggleFilterItem(selectedEntrantFilters, entrantName, setSelectedEntrantFilters)}
                  aria-pressed={selectedEntrantFilters.includes(entrantName)}
                >
                  <span className="matches-filter-list-check" aria-hidden="true">
                    {selectedEntrantFilters.includes(entrantName) ? "✓" : ""}
                  </span>
                  {entrantName}
                </button>
              ))}
            </div>
          </div>
          <div className="matches-filter-group">
            <p className="matches-filter-label">Country</p>
            <div className="matches-filter-scroll-list" role="listbox" aria-label="Filter by country" aria-multiselectable="true">
              {countryOptions.map((country) => (
                <button
                  key={country}
                  type="button"
                  className={`matches-filter-list-item${selectedCountryFilters.includes(country) ? " active" : ""}`}
                  onClick={() => toggleFilterItem(selectedCountryFilters, country, setSelectedCountryFilters)}
                  aria-pressed={selectedCountryFilters.includes(country)}
                >
                  <span className="matches-filter-list-check" aria-hidden="true">
                    {selectedCountryFilters.includes(country) ? "✓" : ""}
                  </span>
                  {country}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {!hideMatchesDuringSwitch ? (
      <section className="matches-grid">
        {filteredMatches.length ? (
          filteredMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              showPhotos={showPhotos}
              ownershipByPlayerId={ownershipByPlayerId}
              onPlayerSelect={setSelectedBioPlayer}
              onHeadToHeadOpen={(selectedMatch) => setSelectedHeadToHead({
                year: selectedYear,
                player1: selectedMatch.player1,
                player2: selectedMatch.player2,
              })}
            />
          ))
        ) : (
          <article className="match-card empty-round-card">
            <div className="match-meta">
              <span>{selectedRound.name}</span>
              <span>{activeFilterCount ? "No matches for current filters" : "Not populated yet"}</span>
            </div>
            <p className="empty-round-copy">
              {activeFilterCount === 0
                ? "This stage does not have any fixtures yet."
                : `No fixtures in ${selectedRound.name} match the entrant, team, or country filters you selected.`}
            </p>
          </article>
        )}
      </section>
      ) : null}
      <SourceTag lastUpdatedAt={lastUpdatedAt} sourceLabel={data.snapshot.dataSourceLabel || SOURCE_LABEL} sourceUrl={data.snapshot.dataSourceUrl} />
      {selectedBioPlayer ? <PlayerBioDialog player={selectedBioPlayer} onClose={() => setSelectedBioPlayer(null)} /> : null}
      {selectedHeadToHead ? <HeadToHeadDialog state={selectedHeadToHead} onClose={() => setSelectedHeadToHead(null)} /> : null}
    </main>
  );
}

function BracketPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedYear, setSelectedYear] = usePublicSelectedYear();
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const manualRefreshRequestedRef = useRef(false);
  const isCompactViewport = useIsCompactViewport();
  const isVeryCompactViewport = useIsCompactViewport(480);

  useEffect(() => {
    let cancelled = false;
    const forceRefresh = manualRefreshRequestedRef.current;
    manualRefreshRequestedRef.current = false;

    async function load(showLoadingState = true) {
      if (showLoadingState) {
        setLoading(true);
      }
      setError("");

      try {
        const nextData = await fetchPool(selectedYear, { forceRefresh });
        if (!cancelled) {
          setData(nextData);
          setLastUpdatedAt(nextData?.snapshot?.cache?.lastUpdatedAt || new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load bracket data.");
        }
      } finally {
        if (!cancelled) {
          if (showLoadingState) {
            setLoading(false);
          }
          if (forceRefresh) {
            setRefreshing(false);
          }
        }
      }
    }

    load();
    const refreshId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        load(false);
      }
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshId);
    };
  }, [selectedYear, refreshNonce]);

  const derived = useMemo(() => {
    if (!data?.snapshot?.rounds?.length) {
      return null;
    }

    const activeRoundKey = getDefaultRoundKey(data.snapshot);
    const bracketRounds = buildBracketRounds(data.snapshot.rounds, data.competitors || []);
    const maxSlots = 2 ** bracketRounds.length;
    const finalRound = data.snapshot.rounds[data.snapshot.rounds.length - 1] || null;
    const tournamentComplete = Boolean(finalRound?.matches?.length) && finalRound.matches.every((match) => Boolean(match.winnerId));
    const championPlayer = data.snapshot.entrants.find((entry) => entry.isChampion && !entry.isPlaceholder) || null;
    const winningCompetitor = championPlayer
      ? (data.competitors || []).find((competitor) => (
        competitor.seeds.some((player) => player?.id === championPlayer.id)
        || competitor.qualifiers.some((player) => player?.id === championPlayer.id)
      )) || null
      : null;
    const completedMatches = bracketRounds.reduce(
      (count, round) => count + round.bracketMatches.filter((match) => match.state === "finished").length,
      0,
    );

    return {
      activeRoundKey,
      bracketRounds,
      maxSlots,
      completedMatches,
      tournamentComplete,
      winningCompetitorName: winningCompetitor?.name || championPlayer?.name || "",
      championPlayerName: championPlayer?.name || "",
    };
  }, [data]);

  if (loading && !data) {
    return <PublicPageSkeleton mode="bracket" showGrid gridCount={3} />;
  }

  if (!data || !data.snapshot?.rounds?.length || !derived) {
    return (
      <PublicErrorState
        mode="bracket"
        title="Knockout data is unavailable"
        message={error || "The knockout view could not be loaded right now."}
        lastUpdatedAt={lastUpdatedAt}
      />
    );
  }

  const poolConfigured = data.poolConfigured !== false;
  const bracketUnit = isVeryCompactViewport ? 320 : isCompactViewport ? 280 : 208;
  const bracketHeight = derived.bracketRounds[0].bracketMatches.length * bracketUnit;

  function jumpToMatchesRound(roundKey) {
    try {
      window.sessionStorage.setItem(PUBLIC_YEAR_SESSION_KEY, JSON.stringify(selectedYear));
      window.sessionStorage.setItem(MATCHES_ROUND_SESSION_KEY, JSON.stringify(roundKey));
    } catch {
      // Ignore session storage failures and allow normal navigation.
    }
  }

  function refreshBracketData() {
    manualRefreshRequestedRef.current = true;
    setRefreshing(true);
    setRefreshNonce((current) => current + 1);
  }

  return (
    <main className="app-shell bracket-page-shell">
      <SiteHeader mode="bracket" poolConfigured={poolConfigured} />

      <section className="bracket-hero-card">
        <div className="bracket-hero-copy">
          <p className="hero-kicker">Knockout tree</p>
          <h1>{BRAND_SHORT_NAME} Knockout</h1>
          <p className="bracket-hero-note">
            {lastUpdatedAt
              ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Waiting for live data"}
          </p>
        </div>
        <div className="matches-hero-tools">
          <RefreshButton onClick={refreshBracketData} busy={refreshing} label={`Refresh ${selectedYear} knockout data`} />
          <div className="bracket-toolbar bracket-toolbar-compact">
            <div className="bracket-control bracket-control-year">
              <p className="toolbar-label">Year</p>
              <label className="toolbar-select-shell">
                <select
                  className="toolbar-select"
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
            </div>
            <div className="bracket-control">
              <span className="bracket-inline-label">{derived.tournamentComplete ? "Status" : "Active round"}</span>
              <strong className="bracket-inline-value">
                {derived.tournamentComplete
                  ? "Complete"
                  : derived.bracketRounds.find((round) => round.key === derived.activeRoundKey)?.name || "Round of 16"}
              </strong>
            </div>
            <div className="bracket-control">
              <span className="bracket-inline-label">{derived.tournamentComplete ? "Winner" : "Completed"}</span>
              <strong className={`bracket-inline-value${derived.tournamentComplete ? " bracket-inline-value-wrap" : ""}`}>
                {derived.tournamentComplete
                  ? `${derived.winningCompetitorName}${derived.championPlayerName ? ` (${derived.championPlayerName})` : ""}`
                  : derived.completedMatches}
              </strong>
            </div>
            <div className="bracket-control">
              <span className="bracket-inline-label">Assignments</span>
              <strong className={`bracket-inline-value bracket-status-value ${poolConfigured ? "live" : "incomplete"}`}>
                {poolConfigured ? "Live" : "Incomplete"}
              </strong>
            </div>
          </div>
        </div>
      </section>

      {error ? <p className="status-banner error">{error}</p> : null}
      {!poolConfigured ? (
        <p className="status-banner">
          The pool is not fully configured yet. Teams without an owner are shown as unassigned until they are allocated to an entrant.
        </p>
      ) : null}

      <section className="section-heading">
        <div>
          <p className="eyebrow">Progression View</p>
          <h2>{data.snapshot.eventName}</h2>
        </div>
        <div className="matches-heading-actions">
          <Link
            className="matches-filter-button"
            to="/fixtures"
            onClick={() => jumpToMatchesRound("group-stage")}
          >
            <span>View Group Stage</span>
          </Link>
        </div>
      </section>

      <section className="bracket-board-shell">
        <div className="bracket-board">
          {derived.bracketRounds.map((round, roundIndex) => (
            <section
              key={round.key}
              className={`bracket-round-column${round.key === derived.activeRoundKey ? " active" : ""}`}
            >
              <Link
                className="bracket-round-header"
                to="/fixtures"
                onClick={() => jumpToMatchesRound(round.key)}
                aria-label={`Open ${round.name} fixtures for ${selectedYear}`}
                title={`Open ${round.name} fixtures`}
              >
                <p className="eyebrow">Stage</p>
                <h3>{round.name}</h3>
                <span>{round.bracketMatches.length} fixtures</span>
              </Link>
              <div className="bracket-round-stack" style={{ minHeight: `${bracketHeight}px` }}>
                {round.bracketMatches.map((match, matchIndex) => {
                  const winnerId = match.winnerSide?.id || null;
                  const topOffset = (((2 ** roundIndex) - 1) * bracketUnit) / 2;
                  const top = topOffset + matchIndex * (2 ** roundIndex) * bracketUnit;

                  return (
                    <div
                      key={match.key}
                      className={`bracket-match-slot${roundIndex > 0 ? " has-left-connector" : ""}${roundIndex < derived.bracketRounds.length - 1 ? " has-right-connector" : ""}`}
                      style={{ top: `${top}px` }}
                    >
                      <article className={`bracket-match-card ${match.state}`}>
                        <div className="bracket-match-meta">
                          <div>
                            <span>{match.label}</span>
                            {match.scheduledDate ? <small>{match.scheduledDate.slice(0, 10)}</small> : null}
                          </div>
                          {match.state === "finished" ? <strong>Complete</strong> : match.state === "in-play" ? <strong>Live</strong> : null}
                        </div>

                        {[match.side1, match.side2].map((side) => (
                          <div
                            key={`${match.key}-${side.id}`}
                            className={`bracket-side-row${side.id === winnerId ? " winner" : ""}${winnerId && side.id !== winnerId ? " loser" : ""}${side.isPlaceholder ? " placeholder" : ""}${side.isUnassigned ? " unassigned" : ""}`}
                          >
                            <div className="bracket-side-copy">
                              <span className="bracket-player-name">
                                {!side.isPlaceholder && side.playerPhoto ? (
                                  <img className="bracket-team-flag" src={side.playerPhoto} alt="" aria-hidden="true" />
                                ) : !side.isPlaceholder ? (
                                  <NationalityFlag nationality={side.playerNationality || side.playerName} className="bracket-team-flag" />
                                ) : null}
                                <span>{side.playerName}</span>
                              </span>
                              <span className="bracket-entrant-name">
                                <span>{side.entrantName}</span>
                                {(side.winningYears || []).length ? (
                                  <span className="bracket-entrant-crowns" aria-label={`${side.winningYears.length} wins`}>
                                    {side.winningYears.map((year) => (
                                      <img
                                        key={`${side.id}-${year}`}
                                        className="competitor-crown"
                                        src={crownIcon}
                                        alt=""
                                        aria-hidden="true"
                                        title={`Winner ${year}`}
                                      />
                                    ))}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                            {side.score !== null ? <span className="bracket-side-score">{side.score}</span> : null}
                          </div>
                        ))}
                        {match.note ? <p className="match-note bracket-match-note">{match.note}</p> : null}
                      </article>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <SourceTag lastUpdatedAt={lastUpdatedAt} sourceLabel={data.snapshot.dataSourceLabel || SOURCE_LABEL} sourceUrl={data.snapshot.dataSourceUrl} />
    </main>
  );
}

function WinnersPage() {
  const [entrants, setEntrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetchEntrants();
        if (!cancelled) {
          setEntrants(response.entrants || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Failed to load winners.");
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

  const winnersByYear = useMemo(() => {
    const winners = [];

    for (const entrant of entrants) {
      for (const year of entrant.winningYears || []) {
        winners.push({
          year,
          entrantId: entrant.id,
          entrantName: entrant.name,
        });
      }
    }

    return winners.sort((left, right) => right.year - left.year);
  }, [entrants]);

  if (loading) {
    return <PublicPageSkeleton mode="winners" showGrid gridCount={4} />;
  }

  if (error) {
    return (
      <PublicErrorState
        mode="winners"
        title="Winners data is unavailable"
        message={error}
      />
    );
  }

  return (
    <main className="app-shell winners-page-shell">
      <SiteHeader mode="winners" />

      <section className="winners-hero-card">
        <div className="winners-hero-copy">
          <div className="winners-title-row">
            <div className="winners-title-image-shell winners-trophy-shell" aria-hidden="true">
              <div className="winners-trophy-icon">◎</div>
            </div>
          </div>
          <h1>World Cup Pool Winners</h1>
        </div>
      </section>

      <section className="section-heading winners-section-heading">
        <div>
          <p className="eyebrow">Winner Timeline</p>
          <h2>By Year</h2>
        </div>
      </section>

      {winnersByYear.length ? (
        <section className="winners-grid">
          {winnersByYear.map((winner) => (
            <article key={`${winner.year}-${winner.entrantId}`} className="winner-year-card">
              <p className="eyebrow">Champion</p>
              <div className="winner-year-row">
                <strong>{winner.year}</strong>
                <span className="winner-crown-badge" aria-hidden="true">
                  <img
                    className="competitor-crown"
                    src={crownIcon}
                    alt=""
                  />
                </span>
              </div>
              <h3>{winner.entrantName}</h3>
            </article>
          ))}
        </section>
      ) : (
        <p className="status-banner">No past winners have been recorded yet.</p>
      )}

      <SourceTag sourceLabel="WorldCupPool winner registry" sourceUrl="https://github.com/lewtondoteth/WorldCupTracker" />
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
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [entrantsLoading, setEntrantsLoading] = useState(false);
  const [savingEntrants, setSavingEntrants] = useState(false);
  const [playerOverridesLoading, setPlayerOverridesLoading] = useState(false);
  const [savingPlayerOverrides, setSavingPlayerOverrides] = useState(false);
  const [siteSettingsLoading, setSiteSettingsLoading] = useState(false);
  const [savingSiteSettings, setSavingSiteSettings] = useState(false);
  const [status, setStatus] = useState("Build the current year's World Cup pool by dragging knockout teams into each entrant, then save it.");
  const [error, setError] = useState("");
  const [playerOverrideStatus, setPlayerOverrideStatus] = useState("");
  const [siteSettingsStatus, setSiteSettingsStatus] = useState("");
  const [builder, setBuilder] = useState(null);
  const [entrantRegistry, setEntrantRegistry] = useState([]);
  const [playerOverrides, setPlayerOverrides] = useState([]);
  const [siteSettings, setSiteSettings] = useState({ clacksNames: [], clacksHeaderPreview: "" });
  const [selectedRegistryEntrantId, setSelectedRegistryEntrantId] = useState("");
  const [newEntrantName, setNewEntrantName] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [selectedPlayerOverrideId, setSelectedPlayerOverrideId] = useState("");
  const [clacksDraft, setClacksDraft] = useState("");
  const [showAutoAssignConfirm, setShowAutoAssignConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoAssignTargets, setAutoAssignTargets] = useState({});
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

  async function loadPlayerOverrides() {
    try {
      setPlayerOverridesLoading(true);
      setError("");
      const data = await fetchPlayerOverrides();
      setPlayerOverrides(data.overrides || []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load player overrides.");
    } finally {
      setPlayerOverridesLoading(false);
    }
  }

  async function loadSiteSettings() {
    try {
      setSiteSettingsLoading(true);
      setError("");
      const data = await fetchSiteSettings();
      const nextSettings = {
        clacksNames: data.clacksNames || [],
        clacksHeaderPreview: data.clacksHeaderPreview || "",
      };
      setSiteSettings(nextSettings);
      setClacksDraft((nextSettings.clacksNames || []).join("\n"));
    } catch (loadError) {
      setError(loadError.message || "Failed to load site settings.");
    } finally {
      setSiteSettingsLoading(false);
    }
  }

  useEffect(() => {
    if (authenticated) {
      loadEntrants();
      loadPlayerOverrides();
      loadSiteSettings();
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadBuilder();
      setSelectedRegistryEntrantId("");
      setShowAutoAssignConfirm(false);
      setShowResetConfirm(false);
      setAutoAssignTargets({});
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

  const availablePlayersForOverrides = useMemo(() => (
    (builder?.snapshot?.entrants || [])
      .filter((entry) => !entry.isPlaceholder)
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
  ), [builder]);

  const filteredPlayersForOverrides = useMemo(() => {
    const searchTerm = playerSearch.trim().toLowerCase();
    if (!searchTerm) {
      return availablePlayersForOverrides;
    }

    return availablePlayersForOverrides.filter((player) => (
      player.name.toLowerCase().includes(searchTerm)
      || String(player.nationality || "").toLowerCase().includes(searchTerm)
    ));
  }, [availablePlayersForOverrides, playerSearch]);

  const playerOverridesById = useMemo(() => new Map(
    playerOverrides.map((override) => [Number(override.playerId), override]),
  ), [playerOverrides]);

  const selectedOverridePlayer = useMemo(() => {
    const selectedId = Number(selectedPlayerOverrideId);
    return filteredPlayersForOverrides.find((player) => player.id === selectedId) || null;
  }, [filteredPlayersForOverrides, selectedPlayerOverrideId]);

  const selectedPlayerOverride = selectedOverridePlayer
    ? playerOverridesById.get(selectedOverridePlayer.id) || null
    : null;
  const clacksDraftPreview = useMemo(
    () => buildClacksHeaderPreview(clacksDraft.split("\n")),
    [clacksDraft],
  );

  useEffect(() => {
    if (!filteredPlayersForOverrides.length) {
      setSelectedPlayerOverrideId("");
      return;
    }

    const selectedId = Number(selectedPlayerOverrideId);
    const stillVisible = filteredPlayersForOverrides.some((player) => player.id === selectedId);
    if (!stillVisible) {
      setSelectedPlayerOverrideId(String(filteredPlayersForOverrides[0].id));
    }
  }, [filteredPlayersForOverrides, selectedPlayerOverrideId]);

  const autoAssignDerived = useMemo(() => {
    if (!builder?.snapshot || !builderDerived?.competitors?.length) {
      return null;
    }

    const entrantIds = builderDerived.competitors.map((competitor, index) => competitor.entrantId || `competitor-${index}`);
    const totalSeeds = builder.snapshot.seeds.length;
    const totalQualifiers = builder.snapshot.qualifiers.length;
    const requiresCustomTargets = (
      totalSeeds % entrantIds.length !== 0
      || totalQualifiers % entrantIds.length !== 0
    );
    const suggestedSeedTargets = buildSuggestedTargetCounts(totalSeeds, entrantIds);
    const suggestedQualifierTargets = buildSuggestedTargetCounts(totalQualifiers, entrantIds);

    return {
      entrantIds,
      totalSeeds,
      totalQualifiers,
      requiresCustomTargets,
      suggestedSeedTargets,
      suggestedQualifierTargets,
    };
  }, [builder, builderDerived]);

  const autoAssignProgress = useMemo(() => {
    if (!autoAssignDerived || !builderDerived?.competitors?.length) {
      return null;
    }

    let assignedSeeds = 0;
    let assignedQualifiers = 0;

    for (const [index, competitor] of builderDerived.competitors.entries()) {
      const entrantId = competitor.entrantId || `competitor-${index}`;
      const target = autoAssignTargets[entrantId] || {};
      assignedSeeds += normaliseTargetCountInput(target.seedIds) || 0;
      assignedQualifiers += normaliseTargetCountInput(target.qualifierIds) || 0;
    }

    return {
      assignedSeeds,
      assignedQualifiers,
      totalSeeds: autoAssignDerived.totalSeeds,
      totalQualifiers: autoAssignDerived.totalQualifiers,
    };
  }, [autoAssignDerived, autoAssignTargets, builderDerived]);

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

  function openAutoAssignWizard() {
    if (!autoAssignDerived || !builderDerived?.competitors?.length) {
      return;
    }

    setError("");
    setShowAutoAssignConfirm(true);
    setAutoAssignTargets(Object.fromEntries(
      builderDerived.competitors.map((competitor, index) => {
        const entrantId = competitor.entrantId || `competitor-${index}`;
        return [entrantId, {
          seedIds: String(autoAssignDerived.suggestedSeedTargets.get(entrantId) || 0),
          qualifierIds: String(autoAssignDerived.suggestedQualifierTargets.get(entrantId) || 0),
        }];
      }),
    ));
  }

  function handleAutoAssignTargetChange(entrantId, bucket, value) {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setAutoAssignTargets((current) => ({
      ...current,
      [entrantId]: {
        ...(current[entrantId] || {}),
        [bucket]: value,
      },
    }));
  }

  function validateAutoAssignTargets() {
    if (!autoAssignDerived || !builderDerived?.competitors?.length) {
      return { valid: false, message: "The tournament builder is still loading." };
    }

    const seedTargets = new Map();
    const qualifierTargets = new Map();
    let seedTotal = 0;
    let qualifierTotal = 0;

    for (const [index, competitor] of builderDerived.competitors.entries()) {
      const entrantId = competitor.entrantId || `competitor-${index}`;
      const target = autoAssignTargets[entrantId] || {};
      const seedCount = normaliseTargetCountInput(target.seedIds);
      const qualifierCount = normaliseTargetCountInput(target.qualifierIds);

      if (seedCount === null || qualifierCount === null) {
        return {
          valid: false,
          message: `Enter valid whole numbers for ${competitor.name}.`,
        };
      }

      seedTargets.set(entrantId, seedCount);
      qualifierTargets.set(entrantId, qualifierCount);
      seedTotal += seedCount;
      qualifierTotal += qualifierCount;
    }

    if (seedTotal !== autoAssignDerived.totalSeeds) {
      return {
        valid: false,
        message: `${SEED_LABEL} targets must add up to ${autoAssignDerived.totalSeeds}.`,
      };
    }

    if (qualifierTotal !== autoAssignDerived.totalQualifiers) {
      return {
        valid: false,
        message: `${QUALIFIER_LABEL} targets must add up to ${autoAssignDerived.totalQualifiers}.`,
      };
    }

    return {
      valid: true,
      targetCounts: {
        seedIds: seedTargets,
        qualifierIds: qualifierTargets,
      },
    };
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
      setError("That tournament entrant already exists.");
      return;
    }

    setError("");
    setStatus(`Added ${selectedEntrant.name}. Drag teams into their ${SEED_LABEL.toLowerCase()} and ${QUALIFIER_LABEL.toLowerCase()} lists.`);
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

  function handlePlayerOverrideFieldChange(playerId, field, value) {
    setPlayerOverrideStatus("");
    setPlayerOverrides((current) => {
      const next = new Map(current.map((override) => [Number(override.playerId), {
        ...override,
        playerId: Number(override.playerId),
      }]));
      const existing = next.get(playerId) || { playerId };
      const candidate = normalisePlayerOverrideDraft({
        ...existing,
        [field]: value,
      });

      if (candidate) {
        next.set(playerId, candidate);
      } else {
        next.delete(playerId);
      }

      return Array.from(next.values()).sort((left, right) => left.playerId - right.playerId);
    });
  }

  async function handleClearSelectedPlayerOverride() {
    if (!selectedOverridePlayer) {
      return;
    }

    try {
      setSavingPlayerOverrides(true);
      setError("");
      const response = await deletePlayerOverride(selectedOverridePlayer.id);
      setPlayerOverrides(response.overrides || []);
      setPlayerOverrideStatus(`Cleared overrides for ${selectedOverridePlayer.name}.`);
    } catch (saveError) {
      setError(saveError.message || "The team override could not be cleared.");
    } finally {
      setSavingPlayerOverrides(false);
    }
  }

  async function handleSavePlayerOverride() {
    if (!selectedOverridePlayer) {
      return;
    }

    try {
      setSavingPlayerOverrides(true);
      setError("");
      const candidate = normalisePlayerOverrideDraft({
        playerId: selectedOverridePlayer.id,
        ...(selectedPlayerOverride || {}),
      });
      const response = candidate
        ? await savePlayerOverride(selectedOverridePlayer.id, candidate)
        : await deletePlayerOverride(selectedOverridePlayer.id);
      setPlayerOverrides(response.overrides || []);
      setPlayerOverrideStatus(
        candidate
          ? `Saved overrides for ${selectedOverridePlayer.name}.`
          : `Cleared overrides for ${selectedOverridePlayer.name}.`,
      );
    } catch (saveError) {
      setError(saveError.message || "The team override could not be saved.");
    } finally {
      setSavingPlayerOverrides(false);
    }
  }

  async function handleSaveSiteSettings() {
    try {
      setSavingSiteSettings(true);
      setError("");
      setSiteSettingsStatus("");
      const payload = {
        clacksNames: clacksDraft
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      };
      const response = await saveSiteSettings(payload);
      const nextSettings = {
        clacksNames: response.clacksNames || [],
        clacksHeaderPreview: response.clacksHeaderPreview || "",
      };
      setSiteSettings(nextSettings);
      setClacksDraft((nextSettings.clacksNames || []).join("\n"));
      setSiteSettingsStatus("Clacks header updated.");
    } catch (saveError) {
      setError(saveError.message || "The clacks settings could not be saved.");
    } finally {
      setSavingSiteSettings(false);
    }
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

  function handleAssignAvailablePlayer(entrantId, bucket, playerId) {
    movePlayer(playerId, bucket, { type: "competitor", entrantId, bucket });
  }

  function handleResetYearPicks() {
    if (!builder?.poolData) {
      setError("The tournament builder is still loading.");
      return;
    }

    setError("");
    setBuilder((current) => ({
      ...current,
      poolData: {
        ...current.poolData,
        competitors: (current.poolData?.competitors || []).map((competitor) => ({
          ...competitor,
          seedIds: [],
          qualifierIds: [],
        })),
      },
    }));
    setShowAutoAssignConfirm(false);
    setShowResetConfirm(false);
    setAutoAssignTargets({});
    setStatus(`Cleared all ${selectedAdminYear} picks. Entrants remain in place and can now be reassigned.`);
  }

  async function handleAutoAssignPlayers() {
    if (!builder?.snapshot || !builder?.poolData || !builderDerived) {
      setError("The tournament builder is still loading.");
      return;
    }

    if (!builderDerived.competitors.length) {
      setError("Add pool entrants before running automatic assignment.");
      return;
    }

    try {
      setAutoAssigning(true);
      setError("");
      let targetCounts = null;
      if (autoAssignDerived?.requiresCustomTargets) {
        const validation = validateAutoAssignTargets();
        if (!validation.valid) {
          setError(validation.message);
          return;
        }
        targetCounts = validation.targetCounts;
      }

      const result = buildAutoAssignment(
        builder.snapshot,
        builder.poolData.competitors || [],
        targetCounts,
      );
      setBuilder((current) => ({
        ...current,
        poolData: {
          ...current.poolData,
          competitors: result.competitors,
        },
      }));
      setShowAutoAssignConfirm(false);
      setStatus(
        `Assigned ${result.assignedSeedCount} ${SEED_LABEL.toLowerCase()} and ${result.assignedQualifierCount} ${QUALIFIER_LABEL.toLowerCase()} automatically. Round-of-16 opponents were kept apart.`,
      );
    } catch (assignError) {
      setError(assignError.message || "Automatic assignment failed.");
    } finally {
      setAutoAssigning(false);
    }
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
        eventName: builder.poolData.eventName ?? `${BRAND_SHORT_NAME} ${selectedAdminYear}`,
        competitors: (builder.poolData.competitors || []).map((competitor) => ({
          entrantId: competitor.entrantId,
          name: competitor.name.trim(),
          seedIds: competitor.seedIds || [],
          qualifierIds: competitor.qualifierIds || [],
        })),
      };

      const response = await saveAdminPoolBuilder(selectedAdminYear, payload);
      setBuilder(response);
      setStatus(`Saved the tournament builder to ${response.sourceFile}.`);
    } catch (saveError) {
      setError(saveError.message || "The tournament builder could not be saved.");
    } finally {
      setSavingBuilder(false);
    }
  }

  function handleAdminYearChange(nextYear) {
    setSelectedAdminYear(nextYear);
    setError("");
    setPlayerOverrideStatus("");
    setSiteSettingsStatus("");
  }

  const adminLoadingNotice = siteSettingsLoading
    ? "Loading site settings..."
    : builderLoading
      ? (adminView === "players"
        ? `Loading team data for ${selectedAdminYear}...`
        : `Loading tournament data for ${selectedAdminYear}...`)
      : "";

  if (!authenticated) {
    return (
      <main className="app-shell admin-shell">
        <section className="admin-card admin-login-card">
          <p className="eyebrow">Protected Area</p>
          <h1>Admin</h1>
          <p className="admin-copy">Enter the password to manage the World Cup pool.</p>
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
              <Link className="admin-secondary-link" to="/" reloadDocument>Back to tournament</Link>
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
            <p className="admin-copy">Manage yearly pool assignments and the shared entrant list used to track winners over time.</p>
          </div>
          <button type="button" className="admin-secondary-button" onClick={handleLogout}>Lock admin</button>
        </div>

        <div className="admin-menu">
          <button
            type="button"
            className={adminView === "builder" ? "admin-menu-button active" : "admin-menu-button"}
            onClick={() => setAdminView("builder")}
          >
            Tournament builder
          </button>
          <button
            type="button"
            className={adminView === "entrants" ? "admin-menu-button active" : "admin-menu-button"}
            onClick={() => setAdminView("entrants")}
          >
            Entrants
          </button>
          <button
            type="button"
            className={adminView === "players" ? "admin-menu-button active" : "admin-menu-button"}
            onClick={() => setAdminView("players")}
          >
            Teams
          </button>
          <button
            type="button"
            className={adminView === "clacks" ? "admin-menu-button active" : "admin-menu-button"}
            onClick={() => setAdminView("clacks")}
          >
            Clacks
          </button>
        </div>

        <div className={`admin-builder-toolbar${adminView === "entrants" ? " entrants-view" : ""}${adminView === "players" ? " players-view" : ""}${adminView === "clacks" ? " clacks-view" : ""}`}>
          {adminView === "builder" ? (
            <>
              <div className="admin-stat-card">
                <p className="toolbar-label">Builder year</p>
                <label className="toolbar-select-shell admin-select-shell">
                  <select
                    className="toolbar-select"
                    value={selectedAdminYear}
                    onChange={(event) => handleAdminYearChange(Number(event.target.value))}
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
                <p className="toolbar-label">{SEED_LABEL}</p>
                <p className="toolbar-value">{builderDerived?.availableSeeds.length ?? 0}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">{QUALIFIER_LABEL}</p>
                <p className="toolbar-value">{builderDerived?.availableQualifiers.length ?? 0}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Tournament entrants</p>
                <p className="toolbar-value">{builder?.poolData?.competitors?.length ?? 0}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Tracked winners</p>
                <p className="toolbar-value">{entrantRegistry.reduce((count, entrant) => count + (entrant.winningYears?.length || 0), 0)}</p>
              </div>
            </>
          ) : adminView === "entrants" ? (
            <>
              <div className="admin-stat-card">
                <p className="toolbar-label">Total entrants</p>
                <p className="toolbar-value">{entrantRegistry.length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Entrants with wins</p>
                <p className="toolbar-value">{entrantRegistry.filter((entrant) => (entrant.winningYears?.length || 0) > 0).length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Tracked winners</p>
                <p className="toolbar-value">{entrantRegistry.reduce((count, entrant) => count + (entrant.winningYears?.length || 0), 0)}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Open winner years</p>
                <p className="toolbar-value">
                  {WINNER_YEAR_OPTIONS.filter((year) => !entrantRegistry.some((entrant) => (entrant.winningYears || []).includes(year))).length}
                </p>
              </div>
            </>
          ) : adminView === "players" ? (
            <>
              <div className="admin-stat-card">
                <p className="toolbar-label">Team year</p>
                <label className="toolbar-select-shell admin-select-shell">
                  <select
                    className="toolbar-select"
                    value={selectedAdminYear}
                    onChange={(event) => handleAdminYearChange(Number(event.target.value))}
                    aria-label="Select team year"
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
                <p className="toolbar-label">Teams in field</p>
                <p className="toolbar-value">{availablePlayersForOverrides.length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Custom profiles</p>
                <p className="toolbar-value">{playerOverrides.filter((override) => String(override.info || "").trim()).length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Custom photos</p>
                <p className="toolbar-value">{playerOverrides.filter((override) => String(override.photo || "").trim()).length}</p>
              </div>
            </>
          ) : (
            <>
              <div className="admin-stat-card">
                <p className="toolbar-label">Names carried</p>
                <p className="toolbar-value">{siteSettings.clacksNames.length}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Header status</p>
                <p className="toolbar-value">{siteSettings.clacksHeaderPreview ? "Active" : "Off"}</p>
              </div>
              <div className="admin-stat-card">
                <p className="toolbar-label">Preview values</p>
                <p className="toolbar-value">{siteSettings.clacksNames.length}</p>
              </div>
            </>
          )}
        </div>

        {error ? <p className="status-banner error">{error}</p> : null}
        {adminLoadingNotice ? <p className="status-banner" aria-live="polite">{adminLoadingNotice}</p> : null}
        {adminView === "builder" ? <p className="status-banner">{status}</p> : null}

        {adminView === "builder" ? (
        <section className="admin-builder-panel">
          <div className="admin-builder-header">
            <div>
              <p className="eyebrow">Tournament Builder</p>
              <h2>Create pool entrants and assign the current knockout teams</h2>
              <p className="admin-copy">Saved entrants are reused as the starting list for future years.</p>
            </div>
            <div className="admin-actions">
              <button
                type="button"
                className="admin-secondary-button"
                onClick={() => {
                  if (showAutoAssignConfirm) {
                    setShowAutoAssignConfirm(false);
                    setAutoAssignTargets({});
                    setError("");
                    return;
                  }
                  setShowResetConfirm(false);
                  openAutoAssignWizard();
                }}
                disabled={builderLoading || autoAssigning || !builderDerived?.competitors.length}
              >
                {showAutoAssignConfirm ? "Close auto-assign" : "Auto-assign teams"}
              </button>
              <button
                type="button"
                className="admin-secondary-button admin-danger-button"
                onClick={() => {
                  setError("");
                  setShowAutoAssignConfirm(false);
                  setAutoAssignTargets({});
                  setShowResetConfirm((current) => !current);
                }}
                disabled={builderLoading || autoAssigning || !builderDerived?.competitors.length}
              >
                {showResetConfirm ? "Close reset" : "Reset year picks"}
              </button>
              <button type="button" className="admin-secondary-button" onClick={loadBuilder} disabled={builderLoading}>
                {builderLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" className="admin-submit" onClick={handleSaveBuilder} disabled={savingBuilder || builderLoading}>
                {savingBuilder ? "Saving..." : "Save tournament"}
              </button>
            </div>
          </div>

          {showAutoAssignConfirm ? (
            <section className="admin-auto-assign-panel">
              <div>
                <p className="eyebrow">Auto-Assign Wizard</p>
                <h3>Randomly distribute the current draw</h3>
                <p className="admin-copy">
                  This clears the current {SEED_LABEL.toLowerCase()} and {QUALIFIER_LABEL.toLowerCase()} assignments for {selectedAdminYear}, then redistributes all qualified teams across the existing entrants.
                  The wizard keeps round-of-16 opponents away from the same entrant and balances the draw as evenly as possible.
                </p>
              </div>
              <div className="admin-auto-assign-stats">
                <span>{autoAssignDerived?.totalSeeds ?? 0} {SEED_LABEL.toLowerCase()}</span>
                <span>{autoAssignDerived?.totalQualifiers ?? 0} {QUALIFIER_LABEL.toLowerCase()}</span>
                <span>{builderDerived?.competitors?.length ?? 0} entrants</span>
              </div>
              {autoAssignDerived?.requiresCustomTargets ? (
                <div className="admin-auto-assign-targets">
                  <p className="admin-copy">
                    This year cannot be split evenly, so enter how many {SEED_LABEL.toLowerCase()} and {QUALIFIER_LABEL.toLowerCase()} each entrant should receive before the wizard runs.
                  </p>
                  <div className="admin-auto-assign-progress">
                    <span>
                      {SEED_LABEL} assigned: <strong>{autoAssignProgress?.assignedSeeds ?? 0}</strong> / {autoAssignProgress?.totalSeeds ?? 0}
                    </span>
                    <span>
                      {QUALIFIER_LABEL} assigned: <strong>{autoAssignProgress?.assignedQualifiers ?? 0}</strong> / {autoAssignProgress?.totalQualifiers ?? 0}
                    </span>
                  </div>
                  <div className="admin-auto-assign-target-grid">
                    {builderDerived.competitors.map((competitor, index) => {
                      const entrantId = competitor.entrantId || `competitor-${index}`;
                      const target = autoAssignTargets[entrantId] || {};
                      return (
                        <article key={entrantId} className="admin-auto-assign-target-card">
                          <h4>{competitor.name}</h4>
                          <label className="admin-field" htmlFor={`auto-seeds-${entrantId}`}>{SEED_LABEL}</label>
                          <input
                            id={`auto-seeds-${entrantId}`}
                            className="admin-auto-assign-input"
                            inputMode="numeric"
                            value={target.seedIds ?? ""}
                            onChange={(event) => handleAutoAssignTargetChange(entrantId, "seedIds", event.target.value)}
                          />
                          <label className="admin-field" htmlFor={`auto-qualifiers-${entrantId}`}>{QUALIFIER_LABEL}</label>
                          <input
                            id={`auto-qualifiers-${entrantId}`}
                            className="admin-auto-assign-input"
                            inputMode="numeric"
                            value={target.qualifierIds ?? ""}
                            onChange={(event) => handleAutoAssignTargetChange(entrantId, "qualifierIds", event.target.value)}
                          />
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => {
                    setShowAutoAssignConfirm(false);
                    setAutoAssignTargets({});
                  }}
                  disabled={autoAssigning}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-submit"
                  onClick={handleAutoAssignPlayers}
                  disabled={autoAssigning}
                >
                  {autoAssigning ? "Assigning..." : "Are you sure?"}
                </button>
              </div>
            </section>
          ) : null}

          {showResetConfirm ? (
            <section className="admin-reset-panel">
              <div>
                <p className="eyebrow">Reset Picks</p>
                <h3>Clear the {selectedAdminYear} assignments</h3>
                <p className="admin-copy">
                  This removes all current {SEED_LABEL.toLowerCase()} and {QUALIFIER_LABEL.toLowerCase()} picks for the selected year, but keeps the entrant list itself in place.
                  You can then reassign teams manually or run the auto-assign wizard again.
                </p>
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  className="admin-secondary-button"
                  onClick={() => setShowResetConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="admin-danger-button"
                  onClick={handleResetYearPicks}
                >
                  Are you sure?
                </button>
              </div>
            </section>
          ) : null}

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
            <p className="admin-copy">Loading current knockout teams...</p>
          ) : builderDerived ? (
            <div className="admin-builder-grid">
              <aside className="admin-pool-column">
                <AdminPlayerLane
                  title={`Available ${SEED_LABEL.toLowerCase()}`}
                  bucket="seedIds"
                  players={builderDerived.availableSeeds}
                  emptyCopy={`All ${SEED_LABEL.toLowerCase()} have been assigned.`}
                  onDrop={(event, bucket) => handleDrop(event, { type: "pool", bucket })}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
                <AdminPlayerLane
                  title={`Available ${QUALIFIER_LABEL.toLowerCase()}`}
                  bucket="qualifierIds"
                  players={builderDerived.availableQualifiers}
                  emptyCopy={`All ${QUALIFIER_LABEL.toLowerCase()} have been assigned.`}
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
                          title={SEED_LABEL}
                          bucket="seedIds"
                          players={competitor.seeds}
                          emptyCopy={`Drop ${SEED_LABEL.toLowerCase()} here.`}
                          onDrop={(event, bucket) => handleDrop(event, { type: "competitor", entrantId: competitor.entrantId, bucket })}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onRemove={handleRemoveAssignedPlayer}
                          assignablePlayers={builderDerived.availableSeeds}
                          onAssign={(playerId, bucket) => handleAssignAvailablePlayer(competitor.entrantId, bucket, playerId)}
                          assignLabel={`Add available ${SEED_LABEL.slice(0, -1).toLowerCase()}`}
                        />
                        <AdminPlayerLane
                          title={QUALIFIER_LABEL}
                          bucket="qualifierIds"
                          players={competitor.qualifiers}
                          emptyCopy={`Drop ${QUALIFIER_LABEL.toLowerCase()} here.`}
                          onDrop={(event, bucket) => handleDrop(event, { type: "competitor", entrantId: competitor.entrantId, bucket })}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          onRemove={handleRemoveAssignedPlayer}
                          assignablePlayers={builderDerived.availableQualifiers}
                          onAssign={(playerId, bucket) => handleAssignAvailablePlayer(competitor.entrantId, bucket, playerId)}
                          assignLabel="Add available runner-up"
                        />
                      </div>
                    </article>
                  ))
                ) : (
                  <article className="admin-competitor-card admin-empty-competitor-card">
                    <p className="admin-copy">Add a pool entrant to start assigning the current year's knockout teams.</p>
                  </article>
                )}
              </section>
            </div>
          ) : null}
        </section>
        ) : adminView === "entrants" ? (
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

          <form className="admin-add-form admin-entrant-form" onSubmit={handleAddRegistryEntrant}>
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
                  <div className="admin-entrant-main">
                    <div className="admin-entrant-heading">
                      <label className="admin-field" htmlFor={`entrant-name-${entrant.id}`}>Entrant name</label>
                      <span className="admin-entrant-summary">
                        {(entrant.winningYears || []).length
                          ? `${entrant.winningYears.length} win${entrant.winningYears.length === 1 ? "" : "s"}`
                          : "No wins yet"}
                      </span>
                    </div>
                    <input
                      id={`entrant-name-${entrant.id}`}
                      className="admin-competitor-input"
                      value={entrant.name}
                      onChange={(event) => handleRegistryNameChange(entrant.id, event.target.value)}
                    />
                  </div>
                  <div className="admin-entrant-wins">
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
        ) : adminView === "players" ? (
        <section className="admin-builder-panel">
          <div className="admin-builder-header">
            <div>
              <p className="eyebrow">Team Overrides</p>
              <h2>Override team profiles, links, and badges</h2>
              <p className="admin-copy">Leave any field blank to fall back to the bundled World Cup dataset. Saved overrides are used everywhere that team appears.</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="admin-secondary-button" onClick={loadPlayerOverrides} disabled={playerOverridesLoading}>
                {playerOverridesLoading ? "Refreshing..." : "Refresh overrides"}
              </button>
            </div>
          </div>

          {playerOverrideStatus ? <p className="status-banner">{playerOverrideStatus}</p> : null}

          {builderLoading ? (
            <p className="admin-copy">Loading teams for {selectedAdminYear}...</p>
          ) : (
            <div className="admin-player-overrides-layout">
              <aside className="admin-player-directory">
                <label className="admin-field" htmlFor="player-override-search">Find team</label>
                <input
                  id="player-override-search"
                  className="admin-competitor-input"
                  value={playerSearch}
                  onChange={(event) => setPlayerSearch(event.target.value)}
                  placeholder="Search by name or country"
                />
                <div className="admin-player-directory-list">
                  {filteredPlayersForOverrides.length ? (
                    filteredPlayersForOverrides.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={selectedOverridePlayer?.id === player.id ? "admin-player-directory-item active" : "admin-player-directory-item"}
                        onClick={() => setSelectedPlayerOverrideId(String(player.id))}
                      >
                        <strong>{player.name}</strong>
                        <span>{player.nationality || "Unknown nationality"}</span>
                      </button>
                    ))
                  ) : (
                    <p className="admin-empty-copy">No teams match that search.</p>
                  )}
                </div>
              </aside>

              <section className="admin-player-override-editor">
                {selectedOverridePlayer ? (
                  <>
                    <div className="admin-player-override-header">
                      {selectedPlayerOverride?.photo || selectedOverridePlayer.photo ? (
                        <img
                          className="admin-player-override-photo"
                          src={selectedPlayerOverride?.photo || selectedOverridePlayer.photo}
                          alt=""
                        />
                      ) : (
                        <div className="admin-player-override-photo fallback" aria-hidden="true">
                          {selectedOverridePlayer.name.slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <h3>{selectedOverridePlayer.name}</h3>
                        <p className="admin-copy">
                          {selectedPlayerOverride?.nationality || selectedOverridePlayer.nationality || "Unknown nationality"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="admin-submit admin-player-save-button"
                        onClick={handleSavePlayerOverride}
                        disabled={savingPlayerOverrides || playerOverridesLoading}
                      >
                        {savingPlayerOverrides ? "Saving..." : "Save team"}
                      </button>
                    </div>

                    <div className="admin-player-override-grid">
                      <div>
                        <label className="admin-field" htmlFor="player-override-nickname">Nickname</label>
                        <input
                          id="player-override-nickname"
                          className="admin-competitor-input"
                          value={selectedPlayerOverride?.nickname || ""}
                          onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "nickname", event.target.value)}
                          placeholder="Only shown when set here"
                        />
                      </div>
                      <div>
                        <label className="admin-field" htmlFor="player-override-photo">Image URL</label>
                        <input
                          id="player-override-photo"
                          className="admin-competitor-input"
                          value={selectedPlayerOverride?.photo || ""}
                          onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "photo", event.target.value)}
                          placeholder={selectedOverridePlayer.photo || "Leave blank to use the bundled badge"}
                        />
                      </div>
                      <div>
                        <label className="admin-field" htmlFor="player-override-url">Profile URL</label>
                        <input
                          id="player-override-url"
                          className="admin-competitor-input"
                          value={selectedPlayerOverride?.websiteUrl || ""}
                          onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "websiteUrl", event.target.value)}
                          placeholder={selectedOverridePlayer.websiteUrl || "Leave blank to keep the default link"}
                        />
                      </div>
                      <div>
                        <label className="admin-field" htmlFor="player-override-twitter">Twitter/X</label>
                        <input
                          id="player-override-twitter"
                          className="admin-competitor-input"
                          value={selectedPlayerOverride?.twitter || ""}
                          onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "twitter", event.target.value)}
                          placeholder={selectedOverridePlayer.twitter || "Optional"}
                        />
                      </div>
                      <div>
                        <label className="admin-field" htmlFor="player-override-photo-source">Photo source</label>
                        <input
                          id="player-override-photo-source"
                          className="admin-competitor-input"
                          value={selectedPlayerOverride?.photoSource || ""}
                          onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "photoSource", event.target.value)}
                          placeholder={selectedOverridePlayer.photoSource || "Optional"}
                        />
                      </div>
                      <div>
                        <label className="admin-field" htmlFor="player-override-nationality">Nationality</label>
                        <input
                          id="player-override-nationality"
                          className="admin-competitor-input"
                          value={selectedPlayerOverride?.nationality || ""}
                          onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "nationality", event.target.value)}
                          placeholder={selectedOverridePlayer.nationality || "Leave blank to use API nationality"}
                        />
                      </div>
                      <div>
                        <label className="admin-field" htmlFor="player-override-born">Founded</label>
                        <input
                          id="player-override-born"
                          className="admin-competitor-input"
                          value={selectedPlayerOverride?.born || ""}
                          onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "born", event.target.value)}
                          placeholder={selectedOverridePlayer.born || "YYYY-MM-DD"}
                        />
                      </div>
                    </div>

                    <div className="admin-player-override-field">
                      <label className="admin-field" htmlFor="player-override-info">Admin profile override</label>
                      <textarea
                        id="player-override-info"
                        className="admin-player-override-textarea"
                        value={selectedPlayerOverride?.info || ""}
                        onChange={(event) => handlePlayerOverrideFieldChange(selectedOverridePlayer.id, "info", event.target.value)}
                        placeholder={selectedOverridePlayer.info || "Write the admin-controlled profile text here"}
                      />
                    </div>

                    <div className="admin-actions">
                      <button
                        type="button"
                        className="admin-secondary-button"
                        onClick={handleClearSelectedPlayerOverride}
                        disabled={savingPlayerOverrides}
                      >
                        Clear this team override
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="admin-copy">Choose a team from the list to edit its override data.</p>
                )}
              </section>
            </div>
          )}
        </section>
        ) : (
        <section className="admin-builder-panel">
          <div className="admin-builder-header">
            <div>
              <p className="eyebrow">Clacks Header</p>
              <h2>Carry names in the site response headers</h2>
              <p className="admin-copy">Add one name per line. The server sends them as a single <code>X-Clacks-Overhead</code> header on every response.</p>
            </div>
            <div className="admin-actions">
              <button type="button" className="admin-secondary-button" onClick={loadSiteSettings} disabled={siteSettingsLoading}>
                {siteSettingsLoading ? "Refreshing..." : "Refresh"}
              </button>
              <button type="button" className="admin-submit" onClick={handleSaveSiteSettings} disabled={savingSiteSettings || siteSettingsLoading}>
                {savingSiteSettings ? "Saving..." : "Save header"}
              </button>
            </div>
          </div>

          {siteSettingsStatus ? <p className="status-banner">{siteSettingsStatus}</p> : null}

          <div className="admin-clacks-layout">
            <section className="admin-clacks-editor">
              <label className="admin-field" htmlFor="clacks-names">Names</label>
              <textarea
                id="clacks-names"
                className="admin-player-override-textarea admin-clacks-textarea"
                value={clacksDraft}
                onChange={(event) => setClacksDraft(event.target.value)}
                placeholder={"Terry Pratchett\nAnother Name"}
              />
              <p className="admin-copy">Blank lines are ignored, duplicates are removed, and <code>GNU</code> is added automatically if needed.</p>
            </section>

            <section className="admin-clacks-preview">
              <p className="admin-field">Header preview</p>
              <div className="admin-clacks-preview-card">
                <code>{clacksDraftPreview || "No X-Clacks-Overhead header will be sent yet."}</code>
              </div>
            </section>
          </div>
        </section>
        )}

        <div className="admin-actions">
          <Link className="admin-secondary-link" to="/" reloadDocument>Back to tournament</Link>
        </div>
      </section>
    </main>
  );
}

function ProtectedAdminRoute() {
  const authenticated = window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true";
  return authenticated ? <AdminPage /> : <Navigate to="/admin/login" replace />;
}

function NotFoundPage() {
  return (
    <main className="app-shell">
      <SiteHeader mode="not-found" />
      <section className="not-found-card">
        <p className="not-found-eyebrow">404</p>
        <h1>That page has broken off from the pack.</h1>
        <p>
          The link might be out of date, or the page may have moved. Head back to the tournament tracker and we&apos;ll get you back on line.
        </p>
        <div className="not-found-actions">
          <Link className="not-found-link primary" to="/">Back to home</Link>
          <Link className="not-found-link" to="/structure">View structure</Link>
        </div>
      </section>
      <SourceTag />
    </main>
  );
}

export default function App() {
  usePageMetadata();

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/structure" element={<TournamentStructurePage />} />
      <Route path="/groups" element={<Navigate to="/structure" replace />} />
      <Route path="/teams" element={<EntrantsPage />} />
      <Route path="/fixtures" element={<Navigate to="/structure" replace />} />
      <Route path="/knockout" element={<Navigate to="/structure" replace />} />
      <Route path="/group-stage" element={<Navigate to="/structure" replace />} />
      <Route path="/entrants" element={<Navigate to="/teams" replace />} />
      <Route path="/matches" element={<Navigate to="/structure" replace />} />
      <Route path="/bracket" element={<Navigate to="/structure" replace />} />
      <Route path="/winners" element={<WinnersPage />} />
      <Route path="/admin" element={<ProtectedAdminRoute />} />
      <Route path="/admin/login" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
