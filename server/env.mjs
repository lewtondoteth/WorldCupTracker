import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundledDataDir = path.join(__dirname, "data");

function loadLocalEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
}

loadLocalEnvFile(path.join(__dirname, ".env.local"));

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalised = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalised)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalised)) {
    return false;
  }
  return fallback;
}

const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);
const appEnvironment = process.env.APP_ENV || (isRailway ? "railway" : "local");
const mutableDataDir = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || bundledDataDir;
const liveTournamentData = parseBoolean(process.env.LIVE_TOURNAMENT_DATA, !isRailway);

export const runtimeConfig = {
  appEnvironment,
  isRailway,
  isLocal: !isRailway,
  bundledDataDir,
  mutableDataDir,
  liveTournamentData,
  port: Number(process.env.PORT || 5174),
  footballApiBaseUrl: process.env.FOOTBALL_API_BASE_URL || "",
  footballApiKey: process.env.FOOTBALL_API_KEY || "",
};
