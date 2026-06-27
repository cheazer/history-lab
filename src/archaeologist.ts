import fs from "fs";
import path from "path";
import os from "os";
import { spawnSync } from "child_process";
import { buildChunks } from "./fileWalker";
import { createGitHubRepo } from "./Github";

export interface SimulateOptions {
  sourceDir: string;
  repoName: string;
  githubToken: string;
  repoPrivate: boolean;
  startDate: Date;
  endDate: Date;
  authorName: string;
  authorEmail: string;
}

export interface SimulateResult {
  success: boolean;
  repoUrl: string;
  commits: string[];
  chunks: { label: string; fileCount: number }[];
  log: string[];
}

const MESSAGES: Record<string, string> = {
  "setup/config": "Initial project setup and configuration",
  markup: "Add HTML structure and page templates",
  styles: "Add stylesheets and visual design",
  "app code": "Implement core application logic",
  components: "Add reusable UI components",
  assets: "Add static assets and media files",
  misc: "Add remaining project files and tidy up",
};

function git(args: string[], cwd: string, env?: Record<string, string>): string {
  const result = spawnSync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  });

  const stdout = String(result.stdout ?? "").trim();
  const stderr = String(result.stderr ?? "").trim();

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.status ?? "?"}): ${stderr || stdout}`
    );
  }
  return stdout;
}

function spaceDates(start: Date, end: Date, count: number): Date[] {
  if (count <= 0) return [];
  if (count === 1) return [new Date(start)];
  const span = end.getTime() - start.getTime();
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + Math.round(i * step)));
}

function copyFiles(files: string[], sourceDir: string, destDir: string): void {
  for (const file of files) {
    const rel = path.relative(sourceDir, file);
    const dest = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
}

function safeRm(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
  }
}

export async function simulate(opts: SimulateOptions): Promise<SimulateResult> {
  const log: string[] = [];
  const commits: string[] = [];
  const chunkSummary: { label: string; fileCount: number }[] = [];

  const push = (msg: string): void => {
    log.push(msg);
    process.stdout.write(`[archaeologist] ${msg}\n`);
  };

  push(`Reconstructing: ${opts.repoName}`);
  push(`Source: ${opts.sourceDir}`);
  push(`Date range: ${opts.startDate.toDateString()} → ${opts.endDate.toDateString()}`);

  const chunks = buildChunks(opts.sourceDir);
  if (chunks.length === 0) {
    throw new Error("No files found in the source directory.");
  }

  const totalFiles = chunks.reduce((n, c) => n + c.files.length, 0);
  push(`Found ${totalFiles} file(s) across ${chunks.length} chunk(s)`);
  for (const c of chunks) {
    push(`  [${c.label}] → ${c.files.length} file(s)`);
  }

  push("Creating GitHub repository…");
  let repoInfo: Awaited<ReturnType<typeof createGitHubRepo>>;
  try {
    repoInfo = await createGitHubRepo({
      token: opts.githubToken,
      repoName: opts.repoName,
      isPrivate: opts.repoPrivate,
    });
    push(`✓ Created: ${repoInfo.htmlUrl}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`GitHub repo creation failed: ${msg}`);
  }

  const workDir = path.join(
    os.tmpdir(),
    `git-arch-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  fs.mkdirSync(workDir, { recursive: true });
  push(`Work dir: ${workDir}`);

  git(["init"], workDir);
  git(["config", "user.name", opts.authorName], workDir);
  git(["config", "user.email", opts.authorEmail], workDir);

  const authedUrl = repoInfo.cloneUrl.replace("https://", `https://${opts.githubToken}@`);
  git(["remote", "add", "origin", authedUrl], workDir);
  push("✓ Local git repository initialised");

  const dates = spaceDates(opts.startDate, opts.endDate, chunks.length);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const date = dates[i];
    if (!chunk || !date) continue;

    const message = MESSAGES[chunk.label] ?? "Add project files";
    push(`Committing [${chunk.label}] (${i + 1}/${chunks.length}): "${message}"`);

    copyFiles(chunk.files, opts.sourceDir, workDir);
    git(["add", "-A"], workDir);

    const statusResult = spawnSync("git", ["status", "--porcelain"], {
      cwd: workDir,
      encoding: "utf-8",
    });
    const staged = String(statusResult.stdout ?? "").trim();
    if (!staged) {
      push("  (nothing to commit for this chunk — skipping)");
      continue;
    }

    const isoDate = date.toISOString();
    const dateEnv: Record<string, string> = {
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
      GIT_AUTHOR_NAME: opts.authorName,
      GIT_AUTHOR_EMAIL: opts.authorEmail,
      GIT_COMMITTER_NAME: opts.authorName,
      GIT_COMMITTER_EMAIL: opts.authorEmail,
    };

    git(["commit", "-m", message], workDir, dateEnv);
    const shortSha = git(["rev-parse", "--short", "HEAD"], workDir);
    const dateStr = isoDate.slice(0, 10);

    commits.push(`${dateStr} ${shortSha} — ${message}`);
    chunkSummary.push({ label: chunk.label, fileCount: chunk.files.length });
    push(`  ✓ ${shortSha} @ ${dateStr}`);
  }

  if (commits.length === 0) {
    safeRm(workDir);
    throw new Error(
      "No commits were created. The source directory may be empty or contain only ignored files."
    );
  }

  push("Pushing to GitHub…");
  try {
    git(["push", "-u", "origin", "HEAD:main", "--force"], workDir);
    push("✓ Pushed → main");
  } catch {
    try {
      git(["push", "-u", "origin", "HEAD:master", "--force"], workDir);
      push("✓ Pushed → master");
    } catch (err2: unknown) {
      const msg = err2 instanceof Error ? err2.message : String(err2);
      safeRm(workDir);
      throw new Error(`Push failed: ${msg}`);
    }
  }

  safeRm(workDir);
  push("✓ Cleaned up work directory");
  push("━━━ Reconstruction complete ━━━");

  return {
    success: true,
    repoUrl: repoInfo.htmlUrl,
    commits,
    chunks: chunkSummary,
    log,
  };
}