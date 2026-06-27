import fs from "fs";
import path from "path";

export interface FileChunk {
  label: string;
  files: string[];
}

const IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "uploads",
  "temp",
  ".DS_Store",
  "__MACOSX",
  ".next",
  ".nuxt",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".vercel",
]);

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

const CONFIG_NAMES = new Set([
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "tsconfig.base.json",
  "tsconfig.node.json",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.json",
  ".babelrc",
  ".babelrc.js",
  ".env",
  ".env.example",
  ".env.local",
  ".env.production",
  ".gitignore",
  ".gitattributes",
  ".npmignore",
  ".nvmrc",
  ".node-version",
  "webpack.config.js",
  "webpack.config.ts",
  "vite.config.js",
  "vite.config.ts",
  "rollup.config.js",
  "rollup.config.ts",
  "jest.config.js",
  "jest.config.ts",
  "vitest.config.ts",
  "vitest.config.js",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "postcss.config.cjs",
  "next.config.js",
  "next.config.ts",
  "nuxt.config.ts",
  "svelte.config.js",
  "astro.config.mjs",
  "remix.config.js",
  "readme.md",
  "readme.txt",
  "readme.rst",
  "license",
  "licence",
  "makefile",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".dockerignore",
  ".editorconfig",
  ".browserslistrc",
]);

const ASSET_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp4",
  ".mp3",
  ".wav",
  ".ogg",
  ".webm",
  ".pdf",
  ".doc",
  ".docx",
]);

const CODE_EXTS = new Set([
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".php",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".swift",
  ".kt",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".sql",
  ".graphql",
  ".gql",
  ".lua",
  ".r",
  ".dart",
  ".ex",
  ".exs",
]);

function isInComponentDir(parts: string[]): boolean {
  return parts.some(
    (p) => p === "components" || p === "component" || p === "ui" || p === "widgets"
  );
}

function bucketForFile(relativePath: string): string {
  const name = path.basename(relativePath).toLowerCase();
  const ext = path.extname(relativePath).toLowerCase();
  // Split on both sep and forward slash (from ZIPs on Windows)
  const parts = relativePath
    .toLowerCase()
    .replace(/\\/g, "/")
    .split("/");

  // ── Config / setup ────────────────────────────────────────────────────────
  if (CONFIG_NAMES.has(name)) return "setup/config";
  if (
    name.startsWith(".eslintrc") ||
    name.startsWith(".prettierrc") ||
    name.startsWith(".babelrc")
  )
    return "setup/config";

  // ── Markup / templates ────────────────────────────────────────────────────
  if ([".html", ".htm", ".ejs", ".hbs", ".mustache", ".pug", ".njk"].includes(ext)) {
    return isInComponentDir(parts) ? "components" : "markup";
  }
  if ([".jsx", ".tsx"].includes(ext)) {
    return isInComponentDir(parts) ? "components" : "markup";
  }
  if ([".vue", ".svelte"].includes(ext)) {
    return isInComponentDir(parts) ? "components" : "markup";
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  if ([".css", ".scss", ".sass", ".less", ".styl", ".pcss"].includes(ext)) {
    return "styles";
  }

  // ── Assets ────────────────────────────────────────────────────────────────
  if (ASSET_EXTS.has(ext)) return "assets";

  // ── Components (by directory, any code) ───────────────────────────────────
  if (isInComponentDir(parts)) return "components";

  // ── App code ──────────────────────────────────────────────────────────────
  if (CODE_EXTS.has(ext)) return "app code";

  // ── Misc ─────────────────────────────────────────────────────────────────
  return "misc";
}

export function buildChunks(sourceDir: string): FileChunk[] {
  const allFiles: string[] = [];
  walk(sourceDir, allFiles);

  // Initialise every bucket so insertion order matches BUCKET_ORDER
  const buckets = new Map<string, string[]>(
    BUCKET_ORDER.map((label) => [label, []] as [string, string[]])
  );

  for (const file of allFiles) {
    const relative = path.relative(sourceDir, file);
    const bucket = bucketForFile(relative);
    const dest = buckets.has(bucket) ? bucket : "misc";
    buckets.get(dest)!.push(file);
  }

  const chunks: FileChunk[] = [];
  for (const label of BUCKET_ORDER) {
    const files = buckets.get(label)!;
    if (files.length > 0) {
      chunks.push({ label, files });
    }
  }

  return chunks;
}