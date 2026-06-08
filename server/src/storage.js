import fs from "node:fs/promises";
import path from "node:path";

export const rootDir = process.cwd();
export const runtimeDir = path.resolve(process.env.RUNTIME_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || rootDir);
export const uploadDir = path.join(runtimeDir, "uploads");
export const dataDir = path.join(runtimeDir, "data");
export const outputsDir = path.join(runtimeDir, "outputs");

export async function ensureRuntimeDirs() {
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });
}

export function getJobDir(jobId) {
  return path.join(dataDir, jobId);
}

export async function saveJobResult(jobId, result) {
  const jobDir = getJobDir(jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, "result.json"), JSON.stringify(result, null, 2), "utf8");
}

export async function loadJobResult(jobId) {
  const raw = await fs.readFile(path.join(getJobDir(jobId), "result.json"), "utf8");
  return JSON.parse(raw);
}

export async function jobResultExists(jobId) {
  try {
    await fs.access(path.join(getJobDir(jobId), "result.json"));
    return true;
  } catch {
    return false;
  }
}
