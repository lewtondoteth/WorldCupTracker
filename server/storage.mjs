import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runtimeConfig } from "./env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_DATA_DIR = path.join(__dirname, "data");
const MUTABLE_DATA_DIR = runtimeConfig.mutableDataDir;
const POOL_DIR = path.join(MUTABLE_DATA_DIR, "pools");
const BUNDLED_POOL_DIR = path.join(BUNDLED_DATA_DIR, "pools");
const STATIC_DIR = path.join(BUNDLED_DATA_DIR, "static");
const ENTRANT_REGISTRY_PATH = path.join(MUTABLE_DATA_DIR, "entrants.json");
const BUNDLED_ENTRANT_REGISTRY_PATH = path.join(BUNDLED_DATA_DIR, "entrants.json");
const PLAYER_OVERRIDES_PATH = path.join(MUTABLE_DATA_DIR, "player-overrides.json");

export function getPoolFilePath(year) {
  return path.join(POOL_DIR, `world-championship-${year}.json`);
}

export function getStaticSnapshotPath(year) {
  return path.join(STATIC_DIR, `world-championship-${year}.json`);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function seedFromBundledFileIfMissing(targetPath, bundledPath, fallbackData = null) {
  try {
    return await readJson(targetPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    const bundledData = await readJson(bundledPath);
    await writeJson(targetPath, bundledData);
    return bundledData;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  if (fallbackData !== null) {
    await writeJson(targetPath, fallbackData);
    return fallbackData;
  }

  const missingError = new Error(`Missing data file: ${targetPath}`);
  missingError.code = "ENOENT";
  throw missingError;
}

export async function readPoolFile(year) {
  const filePath = getPoolFilePath(year);
  const bundledPath = path.join(BUNDLED_POOL_DIR, `world-championship-${year}.json`);
  return {
    filePath,
    data: await seedFromBundledFileIfMissing(filePath, bundledPath),
  };
}

export async function readPoolFileOptional(year) {
  const filePath = getPoolFilePath(year);
  const bundledPath = path.join(BUNDLED_POOL_DIR, `world-championship-${year}.json`);
  return {
    filePath,
    data: await seedFromBundledFileIfMissing(filePath, bundledPath, {
      year,
      eventName: `World Championship ${year}`,
      competitors: [],
    }),
  };
}

export async function writePoolFile(year, payload) {
  const filePath = getPoolFilePath(year);
  await writeJson(filePath, payload);
  return filePath;
}

export async function readEntrantRegistry() {
  const data = await seedFromBundledFileIfMissing(ENTRANT_REGISTRY_PATH, BUNDLED_ENTRANT_REGISTRY_PATH, {
    entrants: [],
  });
  return Array.isArray(data?.entrants) ? data.entrants : [];
}

export async function writeEntrantRegistry(entrants) {
  await writeJson(ENTRANT_REGISTRY_PATH, { entrants });
  return ENTRANT_REGISTRY_PATH;
}

export async function readPlayerOverrides() {
  const data = await seedFromBundledFileIfMissing(PLAYER_OVERRIDES_PATH, PLAYER_OVERRIDES_PATH, {
    overrides: [],
  });
  return Array.isArray(data?.overrides) ? data.overrides : [];
}

export async function writePlayerOverrides(overrides) {
  await writeJson(PLAYER_OVERRIDES_PATH, { overrides });
  return PLAYER_OVERRIDES_PATH;
}
