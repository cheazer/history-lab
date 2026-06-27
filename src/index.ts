import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import AdmZip from "adm-zip";
import { simulate } from "./archaeologist";

const app = express();
const publicDir = path.resolve(__dirname, "..", "public");
const uploadDir = path.resolve(__dirname, "..", "uploads");
const tempDir = path.resolve(__dirname, "..", "temp");

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

const upload = multer({ dest: uploadDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

const parseBoolean = (value: unknown): boolean =>
  ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const parseDate = (value: string): Date => new Date(value);

app.get("/", (_req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send(`Missing file: ${indexPath}`);
  }
  return res.sendFile(indexPath);
});


app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  const indexPath = path.join(publicDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    return res.status(500).send(`Missing file: ${indexPath}`);
  }
  return res.sendFile(indexPath);
});

app.post("/api/simulate", upload.single("archive"), async (req, res) => {
  try {
    const sourceType = isNonEmptyString(req.body.sourceType) ? req.body.sourceType.trim() : "";
    const sourcePath = isNonEmptyString(req.body.sourcePath) ? req.body.sourcePath.trim() : "";
    const repoName = isNonEmptyString(req.body.repoName) ? req.body.repoName.trim() : "";
    const githubToken = isNonEmptyString(req.body.githubToken) ? req.body.githubToken.trim() : "";
    const repoPrivate = parseBoolean(req.body.repoPrivate);
    const startDateRaw = isNonEmptyString(req.body.startDate) ? req.body.startDate.trim() : "";
    const endDateRaw = isNonEmptyString(req.body.endDate) ? req.body.endDate.trim() : "";
    const authorName = isNonEmptyString(req.body.authorName) ? req.body.authorName.trim() : undefined;
    const authorEmail = isNonEmptyString(req.body.authorEmail) ? req.body.authorEmail.trim() : undefined;

    if (!["folder", "zip"].includes(sourceType)) {
      return res.status(400).json({ error: "sourceType must be either 'folder' or 'zip'." });
    }
    if (!repoName) return res.status(400).json({ error: "repoName is required." });
    if (!githubToken) return res.status(400).json({ error: "githubToken is required." });
    if (!startDateRaw || !endDateRaw) {
      return res.status(400).json({ error: "startDate and endDate are required." });
    }

    const startDate = parseDate(startDateRaw);
    const endDate = parseDate(endDateRaw);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate >= endDate
    ) {
      return res.status(400).json({
        error: "startDate and endDate must be valid dates with startDate before endDate.",
      });
    }

    let actualSourcePath = sourcePath;

    if (sourceType === "zip") {
      if (!req.file?.path) {
        return res.status(400).json({
          error: "ZIP archive file is required for sourceType 'zip'.",
        });
      }

      const extractPath = path.join(
        tempDir,
        `${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      fs.mkdirSync(extractPath, { recursive: true });
      new AdmZip(req.file.path).extractAllTo(extractPath, true);
      actualSourcePath = extractPath;
    }

    if (sourceType === "folder" && !actualSourcePath) {
      return res.status(400).json({
        error: "sourcePath is required for sourceType 'folder'.",
      });
    }

    const result = await simulate({
      sourceDir: actualSourcePath,
      repoName,
      githubToken,
      repoPrivate,
      startDate,
      endDate,
      authorName: authorName ?? "Git Archaeologist",
      authorEmail: authorEmail ?? "git-archaeologist@example.com",
    });

    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Git Archaeologist running → http://localhost:${process.env.PORT || 3000}`);
});