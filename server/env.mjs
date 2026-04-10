import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundledDataDir = path.join(__dirname, "data");

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
