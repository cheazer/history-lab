import express, { Request, Response } from "express";
import path from "path";
import { simulate } from "./archaeologist";

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

interface SimulateBody {
  sourcePath: string;
  targetPath: string;
  startDate: string;
  endDate: string;
  authorName?: string;
  authorEmail?: string;
}

app.post("/api/simulate", (req: Request<{}, {}, SimulateBody>, res: Response) => {
  const { sourcePath, targetPath, startDate, endDate, authorName, authorEmail } = req.body;

  if (!sourcePath || !targetPath || !startDate || !endDate) {
    res.status(400).json({
      error: "sourcePath, targetPath, startDate, and endDate are required.",
    });
    return;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({
      error: "startDate and endDate must be valid ISO 8601 strings.",
    });
    return;
  }

  if (start >= end) {
    res.status(400).json({
      error: "startDate must be before endDate.",
    });
    return;
  }

  try {
    const result = simulate({
      sourcePath,
      targetPath,
      startDate: start,
      endDate: end,
      ...(authorName !== undefined ? { authorName } : {}),
      ...(authorEmail !== undefined ? { authorEmail } : {}),
    });

    res.status(200).json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown server error";
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