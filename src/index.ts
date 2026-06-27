import express, { Request, Response } from "express";
import path from "path";
import { simulate } from "./archaeologist";
import fs from "fs";
import multer from "multer";
import { execSync } from "child_process";
import { createGitHubRepo } from "./Github";
import AdmZip from "adm-zip";

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const uploadDir = path.join(__dirname, "../uploads");
const tempDir = path.join(__dirname, "../temp");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({ dest: uploadDir });

const parseBoolean = (value: string | undefined): boolean =>
  ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

interface StartBody {
  sourceType: "folder" | "zip";
  sourcePath?: string;
  repoName: string;
  githubToken: string;
  repoPrivate: string;
  startDate: string;
  endDate: string;
  authorName?: string;
  authorEmail?: string;
}

app.post("/api/simulate", upload.single("archive"), async (req, res) => {
  try {
    const sourceType = isNonEmptyString(req.body.sourceType)
      ? req.body.sourceType.trim()
      : "";
    const sourcePath = isNonEmptyString(req.body.sourcePath)
      ? req.body.sourcePath.trim()
      : "";
    const repoName = isNonEmptyString(req.body.repoName)
      ? req.body.repoName.trim()
      : "";
    const githubToken = isNonEmptyString(req.body.githubToken)
      ? req.body.githubToken.trim()
      : "";
    const repoPrivate = isNonEmptyString(req.body.repoPrivate)
      ? req.body.repoPrivate.trim()
      : "false";
    const startDate = isNonEmptyString(req.body.startDate)
      ? req.body.startDate.trim()
      : "";
    const endDate = isNonEmptyString(req.body.endDate)
      ? req.body.endDate.trim()
      : "";
    const authorName = isNonEmptyString(req.body.authorName)
      ? req.body.authorName.trim()
      : undefined;
    const authorEmail = isNonEmptyString(req.body.authorEmail)
      ? req.body.authorEmail.trim()
      : undefined;

    if (!["folder", "zip"].includes(sourceType)) {
      res.status(400).json({ error: "sourceType must be either 'folder' or 'zip'." });
      return;
    }

    if (!repoName) {
      res.status(400).json({ error: "repoName is required." });
      return;
    }

    if (!githubToken) {
      res.status(400).json({ error: "githubToken is required." });
      return;
    }

    if (!startDate || !endDate) {
      res.status(400).json({ error: "startDate and endDate are required." });
      return;
    }

    const isPrivate = parseBoolean(repoPrivate);

    let actualSourcePath = sourcePath;
    if (sourceType === "zip") {
      if (!req.file || !req.file.path) {
        res.status(400).json({ error: "ZIP archive file is required for sourceType 'zip'." });
        return;
      }

      const extractPath = path.join(
        tempDir,
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      fs.mkdirSync(extractPath, { recursive: true });

      const zip = new AdmZip(req.file.path);
      zip.extractAllTo(extractPath, true);
      actualSourcePath = extractPath;
    }

    if (sourceType === "folder" && !actualSourcePath) {
      res.status(400).json({ error: "sourcePath is required for sourceType 'folder'." });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      res.status(400).json({ error: "startDate and endDate must be valid dates with startDate before endDate." });
      return;
    }

    const { cloneUrl } = await createGitHubRepo({
      token: githubToken,
      name: repoName,
      private: isPrivate,
    });

    const workDir = path.join(tempDir, `${repoName}-${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const simulateOptions: Parameters<typeof simulate>[0] = {
      sourcePath: actualSourcePath,
      targetPath: workDir,
      startDate: start,
      endDate: end,
    };

    if (authorName) simulateOptions.authorName = authorName;
    if (authorEmail) simulateOptions.authorEmail = authorEmail;

    const result = simulate(simulateOptions);

    execSync(`git remote add origin ${cloneUrl}`, { cwd: workDir, stdio: "pipe" });
    execSync("git push -u origin main", {
      cwd: workDir,
      stdio: "pipe",
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
    });

    res.json({
      success: true,
      repoUrl: cloneUrl,
      commits: result.commits,
      chunks: result.chunks,
      log: result.log,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Git Archaeologist running → http://localhost:${PORT}`);
});

