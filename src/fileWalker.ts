import fs from "fs";
import path from "path";

export interface FileChunk {
  label: string;
  files: string[];
}

const IGNORE = new Set(["node_modules", ".git", "dist", "uploads", "temp", ".DS_Store"]);
const BUCKET_ORDER = [
  "setup/config",
  "markup",
  "styles",
  "app code",
  "components",
  "assets",
  "misc",
];

function sortEntries(entries: fs.Dirent[]): fs.Dirent[] {
  return entries.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function walk(dir: string, files: string[]): void {
  const entries = sortEntries(fs.readdirSync(dir, { withFileTypes: true }));

  for (const entry of entries) {
    if (IGNORE.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}

function isIgnoredPath(filePath: string): boolean {
  return path
    .normalize(filePath)
    .split(path.sep)
    .some((segment) => IGNORE.has(segment));
}

function bucketForFile(filePath: string): string {
  const normalized = path.normalize(filePath).toLowerCase();
  const name = path.basename(normalized);
  const ext = path.extname(normalized);
  const parts = normalized.split(path.sep);

  const configFiles = new Set([
    "package.json",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "jsconfig.json",
    ".eslintrc",
    ".eslintrc.json",
    ".prettierrc",
    ".prettierrc.json",
    ".gitignore",
    "readme.md",
    "readme.mdx",
    "license",
  ]);

  if (configFiles.has(name) || [".json", ".yaml", ".yml", ".toml"].includes(ext)) {
    return "setup/config";
  }

  if ([".html", ".htm", ".svelte", ".vue", ".njk", ".ejs", ".twig"].includes(ext)) {
    return "markup";
  }

  if ([".css", ".scss", ".sass", ".less", ".styl"].includes(ext)) {
    return "styles";
  }

  const assetExts = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".mp4",
    ".mp3",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
  ];

  if (assetExts.includes(ext) || parts.includes("assets") || parts.includes("static") || parts.includes("public")) {
    return "assets";
  }

  const isComponentFolder = parts.includes("components") || parts.includes("component");
  const isPageFolder = parts.includes("pages") || parts.includes("page") || parts.includes("layouts") || parts.includes("layout");

  if (ext === ".tsx" || ext === ".jsx") {
    return isComponentFolder ? "components" : "app code";
  }

  if (ext === ".ts" || ext === ".js") {
    if (isComponentFolder) return "components";
    return "app code";
  }

  if (isComponentFolder) return "components";
  if (isPageFolder) return "app code";

  return "misc";
}

export function buildChunks(sourcePath: string): FileChunk[] {
  const filePaths: string[] = [];
  walk(sourcePath, filePaths);

  const buckets = new Map<string, string[]>(BUCKET_ORDER.map((label) => [label, []]));

  for (const filePath of filePaths) {
    if (isIgnoredPath(filePath)) continue;
    const label = bucketForFile(filePath);
    buckets.get(label)!.push(filePath);
  }

  return BUCKET_ORDER.map((label) => ({ label, files: buckets.get(label)! })).filter((chunk) => chunk.files.length > 0);
}
