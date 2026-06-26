import fs from "fs";
import path from "path";

export interface FileChunk {
  label: string;
  files: string[];
}

const IGNORE = new Set(["node_modules", ".git", "dist", ".DS_Store"]);

function walk(dir: string, acc: Map<string, string[]>): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
    } else {
      const ext = path.extname(entry.name).toLowerCase() || "__noext__";
      if (!acc.has(ext)) acc.set(ext, []);
      acc.get(ext)!.push(fullPath);
    }
  }
}

export function buildChunks(sourcePath: string): FileChunk[] {
  const byExt = new Map<string, string[]>();
  walk(sourcePath, byExt);

  const layerPriority: Record<string, number> = {
    ".json": 0,
    ".yaml": 0,
    ".yml": 0,
    ".toml": 0,
    ".html": 1,
    ".css": 1,
    ".scss": 1,
    ".ts": 2,
    ".tsx": 2,
    ".js": 2,
    ".jsx": 2,
    ".py": 2,
    ".java": 2,
    ".go": 2,
    ".rs": 2,
    ".spec.ts": 3,
    ".test.ts": 3,
    ".spec.js": 3,
    ".test.js": 3,
  };

  return [...byExt.entries()]
    .sort(([a], [b]) => (layerPriority[a] ?? 99) - (layerPriority[b] ?? 99))
    .map(([ext, files]) => ({
      label: ext === "__noext__" ? "misc files" : `${ext} files`,
      files,
    }));
}