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

interface StartBody {
  sourceType: "folder" | "zip";
  sourcePath?: string;
  repoName: string;
  githubToken: string;
  repoPrivate: boolean;
  startDate: string;
  endDate: string;
  authorName?: string;
  authorEmail?: string;
}

app.post("/api/simulate", upload.single("archive"), async (req, res) => {
  try {
    const {
      sourceType,
      sourcePath,
      repoName,
      githubToken,
      repoPrivate,
      startDate,
      endDate,
      authorName,
      authorEmail,
    } = req.body as StartBody;

    const isPrivate = repoPrivate === "true";

    if (!repoName || !githubToken || !startDate || !endDate) {
      res.status(400).json({ error: "repoName, githubToken, startDate, and endDate are required." });
      return;
    }

    let actualSourcePath = sourcePath;

    if (sourceType === "zip") {
      if (!req.file) {
        res.status(400).json({ error: "ZIP upload required." });
        return;
      }

      const extractPath = path.join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(extractPath, { recursive: true });

      const zip = new AdmZip(req.file.path);
      zip.extractAllTo(extractPath, true);
      actualSourcePath = extractPath;
    }

    if (!actualSourcePath) {
      res.status(400).json({ error: "sourcePath is required for folder mode." });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      res.status(400).json({ error: "Invalid startDate or endDate." });
      return;
    }

    const { cloneUrl } = await createGitHubRepo({
      token: githubToken,
      name: repoName,
      private: isPrivate
    });

    const workDir = path.join(tempDir, `${repoName}-${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const result = simulate({
  sourcePath: actualSourcePath,
  targetPath: workDir,
  startDate: start,
  endDate: end,
  ...(authorName !== undefined ? { authorName } : {}),
  ...(authorEmail !== undefined ? { authorEmail } : {}),
});

    execSync(`git remote add origin ${cloneUrl}`, { cwd: workDir, stdio: "pipe" });
    execSync(`git push -u origin main`, {
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

