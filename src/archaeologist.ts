import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { buildChunks, FileChunk } from "./fileWalker";

export interface SimulateOptions {
  sourcePath: string;
  targetPath: string;
  startDate: Date;
  endDate: Date;
  authorName?: string;
  authorEmail?: string;
}

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "uploads", "temp"]);
const CHUNK_PRIORITY = ["setup", "markup", "styles", "app code", "components", "misc files"];

function interpolateDate(start: Date, end: Date, step: number, total: number): Date {
  const ratio = total === 1 ? 1 : step / (total - 1);
  return new Date(start.getTime() + ratio * (end.getTime() - start.getTime()));
}

function toGitTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " +0000");
}

function copyFile(src: string, srcRoot: string, destRoot: string): void {
  const relative = path.relative(srcRoot, src);
  const dest = path.join(destRoot, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function git(cmd: string, cwd: string, env?: NodeJS.ProcessEnv): void {
  execSync(`git ${cmd}`, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
}

function hasStagedChanges(cwd: string, env: NodeJS.ProcessEnv): boolean {
  try {
    const output = execSync("git diff --cached --name-only", {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.toString().trim().length > 0;
  } catch {
    return false;
  }
}

function categorizeChunk(label: string): string {
  if (label.startsWith(".json") || label.startsWith(".yaml") || label.startsWith(".yml") || label.startsWith(".toml")) {
    return "setup";
  }
  if (label.startsWith(".html")) return "markup";
  if (label.startsWith(".css") || label.startsWith(".scss")) return "styles";
  if (label.startsWith(".tsx") || label.startsWith(".jsx")) return "components";
  if (label.startsWith(".ts") || label.startsWith(".js")) return "app code";
  return "misc files";
}

function commitMessage(label: string, index: number, total: number): string {
  if (index === 0) return `chore: initial setup — ${label}`;
  if (index === total - 1) return `feat: finalize ${label}`;

  switch (label) {
    case "setup":
      return "chore: add project setup";
    case "markup":
      return "feat: add markup";
    case "styles":
      return "feat: add styles";
    case "components":
      return "feat: add components";
    case "app code":
      return "feat: add app code";
    default:
      return `feat: add ${label}`;
  }
}

function isIgnored(filePath: string): boolean {
  return path
    .normalize(filePath)
    .split(path.sep)
    .some((segment) => IGNORED_DIRS.has(segment));
}

function normalizeChunks(chunks: FileChunk[]): FileChunk[] {
  return chunks
    .map((chunk) => ({
      label: categorizeChunk(chunk.label),
      files: chunk.files.filter((file) => !isIgnored(file)),
    }))
    .filter((chunk) => chunk.files.length > 0)
    .sort((a, b) => CHUNK_PRIORITY.indexOf(a.label) - CHUNK_PRIORITY.indexOf(b.label));
}

function ensureGitRepo(targetPath: string, authorName: string, authorEmail: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
  if (!fs.existsSync(path.join(targetPath, ".git"))) {
    git("init", targetPath);
  }
  git(`config user.name "${authorName}"`, targetPath);
  git(`config user.email "${authorEmail}"`, targetPath);
}

export function simulate(opts: SimulateOptions): { commits: number; chunks: number; log: string[] } {
  const {
    sourcePath,
    targetPath,
    startDate,
    endDate,
    authorName = "Fanuel Gebru",
    authorEmail = "FischaFanuel@gmail.com",
  } = opts;

  const chunks = buildChunks(sourcePath);
  if (chunks.length === 0) throw new Error("No files found in sourcePath.");

  fs.mkdirSync(targetPath, { recursive: true });
  git("init", targetPath);
  git(`config user.name "${authorName}"`, targetPath);
  git(`config user.email "${authorEmail}"`, targetPath);

  let commitCount = 0;
  const log: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;

    const timestamp = toGitTimestamp(interpolateDate(startDate, endDate, i, chunks.length));
    const dateEnv: NodeJS.ProcessEnv = {
      GIT_AUTHOR_DATE: timestamp,
      GIT_COMMITTER_DATE: timestamp,
    };

    for (const file of chunk.files) {
      copyFile(file, sourcePath, targetPath);
    }

    git("add .", targetPath, dateEnv);

    if (!hasStagedChanges(targetPath, dateEnv)) continue;

    const message = commitMessage(chunk.label, i, chunks.length);
    git(`commit -m "${message}"`, targetPath, dateEnv);

    log.push(`[${timestamp}] ${message} (${chunk.files.length} files)`);
    commitCount++;
  }

  return { commits: commitCount, chunks: chunks.length, log };
}